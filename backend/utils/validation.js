// Validation Helpers - VibeWeb OS

const URL_PATTERN = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/i;
const SIMPLE_DOMAIN_PATTERN = /^([\da-z\.-]+)\.([a-z\.]{2,6})$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_PATTERN = /^[@]?[\w\-\.]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,30}$/;

function validateEmail(email) {
  return EMAIL_PATTERN.test(email);
}

function sanitizeString(str, maxLength = 255) {
  if (!str) return '';
  return str.trim().substring(0, maxLength).replace(/[\x00-\x1F\x7F]/g, '');
}

function validateUrl(url) {
  if (!url) return true;
  return URL_PATTERN.test(url) || SIMPLE_DOMAIN_PATTERN.test(url);
}

function validateContact(contact) {
  if (!contact) return true;
  return EMAIL_PATTERN.test(contact) || CONTACT_PATTERN.test(contact);
}

function validateUsername(username) {
  return USERNAME_REGEX.test(username);
}

module.exports = {
  URL_PATTERN,
  SIMPLE_DOMAIN_PATTERN,
  EMAIL_PATTERN,
  CONTACT_PATTERN,
  USERNAME_REGEX,
  validateEmail,
  sanitizeString,
  validateUrl,
  validateContact,
  validateUsername
};
