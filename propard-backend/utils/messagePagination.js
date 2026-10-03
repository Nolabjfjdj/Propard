function parseMessagePagination(query = {}) {
  const hasBefore =
    typeof query.before === 'string' &&
    query.before.trim() !== '';

  let before = null;

  if (hasBefore) {
    const parsed = new Date(query.before);

    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    before = parsed;
  }

  let limit = 50;

  if (query.limit !== undefined) {
    const parsedLimit = Number(query.limit);

    if (
      !Number.isInteger(parsedLimit) ||
      parsedLimit < 1 ||
      parsedLimit > 100
    ) {
      return null;
    }

    limit = parsedLimit;
  }

  return {
    enabled: hasBefore || query.limit !== undefined,
    before,
    limit
  };
}

module.exports = {
  parseMessagePagination
};
