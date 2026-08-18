import { getGlobalAlert } from '../contexts/AlertContext';

export function confirmAction(
  title: string,
  message: string,
  onConfirm: () => void | Promise<void>,
  confirmText = 'OK',
  cancelText = 'Batal'
) {
  const globalAlert = getGlobalAlert();
  globalAlert.confirmAction(title, message, onConfirm, confirmText, cancelText);
}

export function showAlert(title: string, message: string) {
  const globalAlert = getGlobalAlert();
  globalAlert.showAlert(title, message);
}
