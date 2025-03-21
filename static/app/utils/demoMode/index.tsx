import {setForceHide} from 'sentry/actionCreators/guides';
import {Client} from 'sentry/api';
import ConfigStore from 'sentry/stores/configStore';
import {isActiveSuperuser} from 'sentry/utils/isActiveSuperuser';

import {logout} from '../../actionCreators/account';
import {demoEmailModal, demoSignupModal} from '../../actionCreators/modal';

const SIGN_UP_MODAL_DELAY = 2 * 60 * 1000;

const INACTIVITY_TIMEOUT_MS = 10 * 1000;

const DEMO_MODE_EMAIL_KEY = 'demo-mode:email';

export function extraQueryParameter(): URLSearchParams {
  const extraQueryString = window.SandboxData?.extraQueryString || '';
  const extraQuery = new URLSearchParams(extraQueryString);
  return extraQuery;
}

export function extraQueryParameterWithEmail(): URLSearchParams {
  const params = extraQueryParameter();
  const email = localStorage.getItem('email');
  if (email) {
    params.append('email', email);
  }
  return params;
}

export function urlAttachQueryParams(url: string, params: URLSearchParams): string {
  const queryString = params.toString();
  if (queryString) {
    return url + '?' + queryString;
  }
  return url;
}

export function isDemoModeActive(): boolean {
  return ConfigStore.get('demoMode') && !isActiveSuperuser();
}

export function openDemoSignupModal() {
  if (!isDemoModeActive()) {
    return;
  }
  setTimeout(() => {
    demoSignupModal();
  }, SIGN_UP_MODAL_DELAY);
}

export function openDemoEmailModal() {
  if (!isDemoModeActive()) {
    return;
  }

  // email already added
  if (localStorage.getItem(DEMO_MODE_EMAIL_KEY)) {
    return;
  }

  demoEmailModal({
    onAddedEmail,
    onFailure: () => {
      setForceHide(false);
    },
  });
}

function onAddedEmail(email: string) {
  setForceHide(false);
  localStorage.setItem(DEMO_MODE_EMAIL_KEY, email);
  openDemoSignupModal();
}

let inactivityTimeout: number | undefined;

window.addEventListener('blur', () => {
  if (isDemoModeActive()) {
    inactivityTimeout = window.setTimeout(() => {
      logout(new Client());
    }, INACTIVITY_TIMEOUT_MS);
  }
});

window.addEventListener('focus', () => {
  if (inactivityTimeout) {
    window.clearTimeout(inactivityTimeout);
    inactivityTimeout = undefined;
  }
});
