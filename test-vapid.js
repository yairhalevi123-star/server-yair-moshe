// Test script to verify VAPID keys are loaded
import { config } from 'dotenv';

config();

console.log('=== VAPID Keys Configuration Test ===');
console.log('VAPID_PUBLIC_KEY:', process.env.VAPID_PUBLIC_KEY ? 'SET ✓' : 'NOT SET ✗');
console.log('VAPID_PRIVATE_KEY:', process.env.VAPID_PRIVATE_KEY ? 'SET ✓' : 'NOT SET ✗');
console.log('VAPID_EMAIL:', process.env.VAPID_EMAIL || 'NOT SET');

if (process.env.VAPID_PUBLIC_KEY) {
    console.log('\nPublic Key Length:', process.env.VAPID_PUBLIC_KEY.length);
    console.log('Public Key Preview:', process.env.VAPID_PUBLIC_KEY.substring(0, 20) + '...');
}

if (process.env.VAPID_PRIVATE_KEY) {
    console.log('Private Key Length:', process.env.VAPID_PRIVATE_KEY.length);
    console.log('Private Key Preview:', process.env.VAPID_PRIVATE_KEY.substring(0, 20) + '...');
}
