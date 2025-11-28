const morgan = require('morgan');

// Custom morgan tokens
morgan.token('id', (req) => req.id);
morgan.token('body', (req) => {
  // Don't log sensitive data
  const sanitized = { ...req.body };
  if (sanitized.password) sanitized.password = '[REDACTED]';
  return JSON.stringify(sanitized);
});

// Development logging format
const developmentFormat = morgan((tokens, req, res) => {
  return [
    '🔵',
    tokens.method(req, res),
    tokens.url(req, res),
    tokens.status(req, res),
    tokens.res(req, res, 'content-length'), '-',
    tokens['response-time'](req, res), 'ms'
  ].join(' ');
});

// Production logging format
const productionFormat = morgan('combined');

// Request logger based on environment
const requestLogger = process.env.NODE_ENV === 'production' 
  ? productionFormat 
  : developmentFormat;

module.exports = {
  requestLogger,
  developmentFormat,
  productionFormat
};
