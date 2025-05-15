import PocketBase from 'pocketbase';
import { PB_URL } from '../constants/url';

// Create a single PocketBase instance for the entire app
export const pbclient = new PocketBase(PB_URL);

// Enable more detailed logging for debugging
const originalSave = pbclient.authStore.save;
pbclient.authStore.save = function(token, model) {
  console.log('Auth store save called with:', {
    token: token ? `${token.substring(0, 10)}...` : null,
    model: model ? 'Present' : 'Not present'
  });

  try {
    return originalSave.call(this, token, model);
  } catch (error) {
    console.error('Error in authStore.save:', error);
    throw error;
  }
};

// Load auth data from localStorage if available
if (typeof window !== 'undefined') {
  // Check if we have stored auth data
  const storedAuthData = localStorage.getItem('pocketbase_auth');

  if (storedAuthData) {
    try {
      const { token, model } = JSON.parse(storedAuthData);
      console.log('Restoring auth from localStorage');
      pbclient.authStore.save(token, model);
      console.log('Auth restored, isValid:', pbclient.authStore.isValid);
    } catch (error) {
      console.error('Failed to restore auth state:', error);
      // Clear invalid auth data
      localStorage.removeItem('pocketbase_auth');
    }
  }

  // Subscribe to auth state changes
  pbclient.authStore.onChange((token, model) => {
    console.log('Auth state changed:', token ? 'Authenticated' : 'Unauthenticated');
    console.log('Auth isValid:', pbclient.authStore.isValid);

    if (token && model) {
      // Save auth data to localStorage
      localStorage.setItem(
        'pocketbase_auth',
        JSON.stringify({ token, model })
      );
      console.log('Auth data saved to localStorage');
    } else {
      // Clear auth data from localStorage
      localStorage.removeItem('pocketbase_auth');
      console.log('Auth data cleared from localStorage');
    }
  });
}

// Add a helper method to manually validate a token
pbclient.validateToken = function(token) {
  if (!token) return false;

  try {
    // Try to decode the token
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) return false;

    const base64Url = tokenParts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64));

    // Check if token is expired
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return false;

    return true;
  } catch (error) {
    console.error('Error validating token:', error);
    return false;
  }
};

export default pbclient;
