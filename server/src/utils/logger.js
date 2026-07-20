function timestamp() {
  return new Date().toISOString();
}

const logger = {
  info: (message, meta = {}) => {
    console.log(`[${timestamp()}] INFO  ${message}`, Object.keys(meta).length ? meta : "");
  },
  warn: (message, meta = {}) => {
    console.warn(`[${timestamp()}] WARN  ${message}`, Object.keys(meta).length ? meta : "");
  },
  error: (message, meta = {}) => {
    console.error(`[${timestamp()}] ERROR ${message}`, Object.keys(meta).length ? meta : "");
  },
};

module.exports = logger;
