/**
 * Script para enviar un segundo mensaje y ver logs
 */

import { config } from 'dotenv';
import { sendMessageToBridge } from './src/services/bridgeClient.js';

config({ path: './src/.env' });

async function test() {
  console.log('📱 Enviando mensaje a WhatsApp bridge...\n');
  
  try {
    const response = await sendMessageToBridge(
      '573009999999',
      '¿Cuál es el horario de atención?',
      'María López'
    );

    console.log('✅ Respuesta recibida:');
    console.log('-'.repeat(60));
    console.log(response);
    console.log('-'.repeat(60));
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

test();
