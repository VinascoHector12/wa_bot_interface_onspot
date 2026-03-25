/**
 * Script de prueba para verificar la integración con el bridge service
 * Ejecutar: node test-bridge.js
 */

import { config } from 'dotenv';
import { sendMessageToBridge, checkBridgeHealth } from './src/services/bridgeClient.js';

// Cargar variables de entorno
config({ path: './src/.env' });

async function testBridge() {
  console.log('='.repeat(60));
  console.log('  TEST: Integración WhatsApp Bridge Service');
  console.log('='.repeat(60));
  console.log();

  // 1. Health Check
  console.log('1️⃣  Verificando salud del bridge...');
  const healthy = await checkBridgeHealth();
  
  if (healthy) {
    console.log('   ✅ Bridge service está saludable');
  } else {
    console.log('   ❌ Bridge service no responde o tiene errores');
    console.log('   Verifica que el contenedor esté corriendo:');
    console.log('   docker ps | grep whatsapp_bridge');
    return;
  }
  
  console.log();

  // 2. Enviar mensaje de prueba
  console.log('2️⃣  Enviando mensaje de prueba...');
  console.log('   Phone: 573001234567');
  console.log('   Message: "Hola, ¿qué servicios ofrecen?"');
  console.log();

  try {
    const response = await sendMessageToBridge(
      '573001234567',
      'Hola, ¿qué servicios ofrecen?',
      'Usuario de Prueba'
    );

    console.log('   ✅ Respuesta recibida:');
    console.log('   ' + '-'.repeat(56));
    console.log('   ' + response.split('\n').join('\n   '));
    console.log('   ' + '-'.repeat(56));
  } catch (error) {
    console.log('   ❌ Error:', error.message);
  }

  console.log();
  console.log('='.repeat(60));
  console.log('  Prueba completada');
  console.log('='.repeat(60));
}

testBridge().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
