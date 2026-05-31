import type { ServicePageFailure } from './servicePageTypes'

export function toFriendlyServicePageFailure(errorDescription: string): ServicePageFailure {
  switch (errorDescription) {
    case 'ERR_NAME_NOT_RESOLVED':
      return {
        title: "This site can't be reached",
        message: 'Check if there is a typo in the address.',
        raw: errorDescription
      }
    case 'ERR_INTERNET_DISCONNECTED':
      return {
        title: 'No internet connection',
        message: 'Try checking your network cables, modem, and router.',
        raw: errorDescription
      }
    case 'ERR_CONNECTION_REFUSED':
      return {
        title: "This site can't be reached",
        message: 'The connection was refused.',
        raw: errorDescription
      }
    case 'ERR_ADDRESS_UNREACHABLE':
      return {
        title: "This site can't be reached",
        message: 'The address is unreachable.',
        raw: errorDescription
      }
    case 'ERR_CONNECTION_TIMED_OUT':
      return {
        title: 'This site is taking too long to respond',
        message: 'Try checking your proxy and firewall configuration.',
        raw: errorDescription
      }
    case 'ERR_CONNECTION_RESET':
      return {
        title: "This site can't be reached",
        message: 'The connection was reset.',
        raw: errorDescription
      }
    case 'ERR_NETWORK_CHANGED':
      return {
        title: 'Connection interrupted',
        message: 'A network change was detected.',
        raw: errorDescription
      }
    case 'ERR_CERT_AUTHORITY_INVALID':
    case 'ERR_CERT_DATE_INVALID':
      return {
        title: 'Your connection is not private',
        message: "The site's security certificate is not trusted.",
        raw: errorDescription
      }
    default:
      return {
        title: "This page isn't working",
        message: 'An unexpected error occurred.',
        raw: errorDescription
      }
  }
}
