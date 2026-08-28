import React, { useState } from 'react';
import { View, Text, TextInput, Image, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { saveSession } from '../utils/auth';
import { useNavigation } from '@react-navigation/native';
import { API_URL } from '../utils/constants';

export default function LoginScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigation = useNavigation();

  const handleSubmit = async () => {
    setError('');
    if (!username || !pin) {
      setError('Please fill all fields');
      return;
    }

    setLoading(true);
    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, pin })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to authenticate');

      await saveSession(data.token);
      // @ts-ignore
      navigation.replace('Dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Image source={require('../../assets/pw-logo.png')} style={{width: 80, height: 80, marginBottom: 16}} resizeMode='contain' />
        <Text style={styles.title}>Physics Wallah</Text>
        <Text style={styles.subtitle}>India's Top E-Learning Platform.</Text>

        <TextInput
          style={styles.input}
          placeholder="Phone Number / Email"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="PIN"
          value={pin}
          onChangeText={setPin}
          secureTextEntry
          maxLength={6}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{isLogin ? 'Login' : 'Register'}</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setIsLogin(!isLogin)} style={{ marginTop: 16 }}>
          <Text style={styles.linkText}>
            {isLogin ? "Don't have an account? Register" : "Already have an account? Login"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    backgroundColor: '#f1f5f9',
    padding: 32,
    borderRadius: 24,
    alignItems: 'center',
  },
  icon: { fontSize: 48, marginBottom: 16 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#000000', letterSpacing: 2 },
  subtitle: { color: '#666666', marginBottom: 24 },
  input: {
    width: '100%',
    backgroundColor: '#ffffff',
    color: '#000000',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#cccccc',
  },
  button: {
    width: '100%',
    backgroundColor: '#e32b2b',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  linkText: { color: '#666666', fontSize: 14 },
  error: { color: '#ef4444', marginBottom: 12 },
});
