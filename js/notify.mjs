export const TOPIC = "https://ntfy.sh/shania-radit-766350e890617d63";
export const NO_DEBOUNCE_MS = 400;

const OPENED = "shania.notify.opened";
const NO_COUNT = "shania.notify.noCount";
const YES_TOKEN = "shania.notify.yesToken";
const YES_SENT = "shania.notify.yesSent";
const YES_COUNT = "shania.notify.yesCount";
const SURE_NO = "shania.notify.sureNo";

const TITLES = {
  open: "Shania opened the page",
  no: "Shania tapped NO",
  sure: "Are you sure?",
  "sure-no": "Went back home",
  yes: "Shania said YES!",
};

const PRIORITIES = {
  open: "low",
  no: "low",
  sure: "default",
  "sure-no": "default",
  yes: "urgent",
};

export function wibStamp(date) {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return `${formatted} WIB`;
}

export function messageFor(kind, { count = 0, limit = 5, at = new Date() } = {}) {
  const time = wibStamp(at);
  switch (kind) {
    case "open":
      return `Shania opened the page 👀 · ${time}`;
    case "no":
      return `Shania tapped NO (${count}/${limit}) · ${time}`;
    case "sure":
      return `Shania reached Are you sure? · ${time}`;
    case "sure-no":
      return `Shania tapped NO on Are you sure? (went back home) · ${time}`;
    case "yes":
      return `Shania said YES! 💖 (after ${count} NO taps) · ${time}`;
    default:
      throw new Error(`Unknown notify kind: ${kind}`);
  }
}

export function requestUrl(topic, kind) {
  const params = new URLSearchParams();
  params.set("title", TITLES[kind]);
  params.set("priority", PRIORITIES[kind]);
  if (kind === "yes") params.set("tags", "heart,tada");
  return `${topic}?${params.toString()}`;
}

function read(storage, key) {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(storage, key, value) {
  try {
    storage?.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function remove(storage, key) {
  try {
    storage?.removeItem(key);
  } catch {
    // Storage can be blocked. The page still has to work.
  }
}

function publish(kind, message, { fetchImpl, beacon, topic }) {
  const url = requestUrl(topic, kind);
  try {
    if (typeof fetchImpl === "function") {
      const result = fetchImpl(url, {
        method: "POST",
        body: message,
        mode: "cors",
        keepalive: true,
      });
      if (result && typeof result.catch === "function") result.catch(() => {});
      return;
    }
  } catch {
    // Fall through to sendBeacon when fetch cannot even start.
  }
  try {
    if (typeof beacon === "function") beacon(url, message);
  } catch {
    // Offline or a blocked beacon must not surface to the page.
  }
}

export function createNotifier({
  fetchImpl,
  beacon,
  storage,
  topic = TOPIC,
  now = () => new Date(),
  clock = () => Date.now(),
  debounceMs = NO_DEBOUNCE_MS,
} = {}) {
  let lastNoAt = Number.NEGATIVE_INFINITY;
  let yesSeq = 0;

  function send(kind, extra) {
    try {
      publish(kind, messageFor(kind, { ...extra, at: now() }), { fetchImpl, beacon, topic });
    } catch {
      // Message building or the clock must not break navigation.
    }
  }

  return {
    onAskLoad() {
      const opened = read(storage, OPENED) !== "1";
      if (opened) write(storage, OPENED, "1");
      const sureNo = read(storage, SURE_NO) === "1";
      if (sureNo) remove(storage, SURE_NO);
      write(storage, NO_COUNT, "0");
      if (opened) send("open");
      if (sureNo) send("sure-no");
    },
    onNoTap(count, limit = 5) {
      write(storage, NO_COUNT, String(count));
      let allowed = true;
      try {
        const at = clock();
        allowed = at - lastNoAt >= debounceMs;
        if (allowed) lastNoAt = at;
      } catch {
        allowed = true;
      }
      if (!allowed) return false;
      send("no", { count, limit });
      return true;
    },
    onSureLoad() {
      send("sure");
    },
    armSureReturn() {
      write(storage, SURE_NO, "1");
    },
    armYes() {
      const raw = Number(read(storage, NO_COUNT) || 0);
      const count = Number.isFinite(raw) ? raw : 0;
      yesSeq += 1;
      let token = `yes:${count}:${yesSeq}`;
      try {
        token = `${clock()}:${count}:${yesSeq}`;
      } catch {
        // Keep the sequence token minted above.
      }
      write(storage, YES_TOKEN, token);
      write(storage, YES_COUNT, String(count));
    },
    onYeayyLoad() {
      const token = read(storage, YES_TOKEN);
      if (!token) return false;
      if (read(storage, YES_SENT) === token) return false;
      write(storage, YES_SENT, token);
      const raw = Number(read(storage, YES_COUNT) || 0);
      send("yes", { count: Number.isFinite(raw) ? raw : 0 });
      return true;
    },
  };
}
