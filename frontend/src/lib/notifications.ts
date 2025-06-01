type NotificationType = 'info' | 'success' | 'warning' | 'error';

interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  duration?: number;
}

type NotificationCallback = (notification: Notification) => void;

class NotificationManager {
  private static instance: NotificationManager;
  private listeners: Set<NotificationCallback> = new Set();

  private constructor() {}

  static getInstance(): NotificationManager {
    if (!NotificationManager.instance) {
      NotificationManager.instance = new NotificationManager();
    }
    return NotificationManager.instance;
  }

  subscribe(callback: NotificationCallback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notify(notification: Notification) {
    this.listeners.forEach(listener => listener(notification));
  }

  show(
    message: string, 
    type: NotificationType = 'info', 
    duration: number = 5000
  ) {
    const notification: Notification = {
      id: crypto.randomUUID(),
      type,
      message,
      duration
    };
    this.notify(notification);
  }

  showFeatureStatus(feature: string, available: boolean) {
    const message = available
      ? `${feature} feature is now available`
      : `${feature} feature is temporarily unavailable`;
    
    this.show(message, available ? 'success' : 'info', 3000);
  }
}

export const notifications = NotificationManager.getInstance();