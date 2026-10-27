/** The AES-GCM associated data an encrypted account file is sealed under. Changing it makes every
 *  encrypted account file ever exported unreadable, so it is a format version, never a rename. */
export const ACCOUNT_EXPORT_AAD_LABEL = "nulo:account-export:v1"
