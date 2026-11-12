export function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const status = err.statusCode || (err.name === 'ValidationError' ? 400 : 500);

  if (err.code === 11000) {
    return res.status(409).json({
      message: 'Duplicate value',
      fields: Object.keys(err.keyValue || {}),
    });
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      message: 'Validation failed',
      errors: Object.fromEntries(
        Object.entries(err.errors).map(([k, v]) => [k, v.message])
      ),
    });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({ message: `Invalid ${err.path}: ${err.value}` });
  }

  console.error('[scorehub] error:', err);
  res.status(status).json({ message: err.message || 'Internal server error' });
}

// Wraps async route handlers so rejections reach errorHandler.
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
