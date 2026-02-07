import { apiFetch } from './api';

// Convert base64 URL-safe string to Uint8Array for Push API
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

// Check if push notifications are supported
export function isPushSupported(): boolean {
  return 'PushManager' in window && 'serviceWorker' in navigator;
}

// Check current notification permission
export function getNotificationPermission(): NotificationPermission {
  return Notification.permission;
}

// Request notification permission
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    return 'denied';
  }

  return Notification.requestPermission();
}

// Get VAPID public key from backend
async function getVapidPublicKey(): Promise<string | null> {
  try {
    const response = await apiFetch<{ publicKey: string }>('/push/vapid-public-key');
    return response.publicKey;
  } catch (error) {
    console.error('Failed to get VAPID key:', error);
    return null;
  }
}

// Subscribe to push notifications
export async function subscribeToPush(): Promise<boolean> {
  if (!isPushSupported()) {
    console.log('Push notifications not supported');
    return false;
  }

  try {
    // Request permission first
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      console.log('Notification permission denied');
      return false;
    }

    // Get VAPID key
    const vapidPublicKey = await getVapidPublicKey();
    if (!vapidPublicKey) {
      console.log('VAPID key not available');
      return false;
    }

    // Get service worker registration
    const registration = await navigator.serviceWorker.ready;

    // Subscribe to push
    const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey as BufferSource,
    });

    // Send subscription to backend
    await apiFetch('/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });

    console.log('Push subscription successful');
    return true;
  } catch (error) {
    console.error('Push subscription failed:', error);
    return false;
  }
}

// Unsubscribe from push notifications
export async function unsubscribeFromPush(): Promise<boolean> {
  if (!isPushSupported()) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      return true; // Already unsubscribed
    }

    // Notify backend
    await apiFetch('/push/unsubscribe', {
      method: 'DELETE',
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });

    // Unsubscribe locally
    await subscription.unsubscribe();

    console.log('Push unsubscription successful');
    return true;
  } catch (error) {
    console.error('Push unsubscription failed:', error);
    return false;
  }
}

// Check if currently subscribed
export async function isPushSubscribed(): Promise<boolean> {
  if (!isPushSupported()) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription !== null;
  } catch {
    return false;
  }
}
