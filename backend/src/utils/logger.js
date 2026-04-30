const now = () => new Date().toISOString();

const toErrorInfo = (value) => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  return value;
};

export const logger = {
  info(message, ...args) {
    console.log(`[${now()}] [INFO] ${message}`, ...args.map(toErrorInfo));
  },
  warn(message, ...args) {
    console.warn(`[${now()}] [WARN] ${message}`, ...args.map(toErrorInfo));
  },
  error(message, ...args) {
    console.error(`[${now()}] [ERROR] ${message}`, ...args.map(toErrorInfo));
  },
};
