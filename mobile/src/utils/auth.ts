import * as SecureStore from 'expo-secure-store';

const SESSION_KEY = 'private_chat_session_token';

export const saveSession = async (token: string) => {
  await SecureStore.setItemAsync(SESSION_KEY, token);
};

export const getSession = async () => {
  return await SecureStore.getItemAsync(SESSION_KEY);
};

export const clearSession = async () => {
  await SecureStore.deleteItemAsync(SESSION_KEY);
};
