/**
 * Set just before the app reloads itself on purpose (signing out), so no "Leave site?" prompt
 * can interrupt it: the user already confirmed, and the server session is already gone.
 */
let intentional = false;

export function markIntentionalUnload() {
  intentional = true;
}

export function isIntentionalUnload() {
  return intentional;
}
