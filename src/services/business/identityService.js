/**
 * Servicio de gestión de identidad de usuarios
 * Business Layer - Maneja identificación y seguimiento de usuarios
 */
import {
  getIdentity as getIdentityFromStore,
  loadIdentityFromDB,
  markIdentified,
  markIntroDone,
  extractNameAndOrigin,
  shouldNudgeForIdentity as shouldNudge,
  markIntroAsked,
  buildNudgeText
} from '../../utils/identityStore.js';
import { isPureOriginReply, extractPhone } from '../../core/textUtils.js';

/**
 * Asegura que la identidad del usuario esté cargada en caché desde BD
 */
export async function ensureIdentityLoaded(chatId) {
  await loadIdentityFromDB(chatId);
}

/**
 * Obtiene la identidad actual de un usuario
 */
export function getUserIdentity(chatId) {
  return getIdentityFromStore(chatId);
}

/**
 * Intenta extraer nombre y teléfono real desde el contacto de WhatsApp.
 * Resuelve correctamente chatIds en formato @lid.
 */
export async function extractNameFromContact(client, chatId, currentIdentity) {
  try {
    const contact = await client.getContactById(chatId);

    // Teléfono real: contact.number tiene el número resuelto incluso para @lid
    const resolvedPhone = (contact?.number || contact?.id?.user || '').replace(/\D/g, '');
    const phone = resolvedPhone || extractPhone(chatId);

    const pushname = (contact?.pushname || '').trim();

    const patch = {};
    // Actualizar phone si el actual parece un LID (muy largo o sin formato de teléfono)
    if (phone && currentIdentity.phone !== phone) patch.phone = phone;
    if (!currentIdentity.name && pushname) {
      patch.name = pushname;
      patch.via = 'wa-pushname';
    }

    if (Object.keys(patch).length > 0) {
      return markIdentified(chatId, { ...patch, phone });
    }
  } catch (err) {
    console.error('[identity] Error extrayendo contacto:', err.message);
  }

  return currentIdentity;
}

/**
 * Procesa respuesta de identidad del usuario
 */
export function processIdentityResponse(chatId, text, identity) {
  const extracted = extractNameAndOrigin(text);
  
  if (extracted.origin) {
    const phone = extractPhone(chatId);
    const updated = markIdentified(chatId, {
      origin: extracted.origin,
      phone,
      expectingOrigin: false,
      via: 'text'
    });
    
    markIntroDone(chatId);
    return { updated, acknowledged: true };
  }
  
  return { updated: identity, acknowledged: false };
}

/**
 * Verifica si se debe solicitar identidad
 */
export function shouldRequestIdentity(text, identity) {
  return shouldNudge(text, identity);
}

/**
 * Construye mensaje de solicitud de identidad
 */
export function buildIdentityNudge(identity) {
  return buildNudgeText(identity);
}

/**
 * Verifica si el mensaje es solo una respuesta de origen
 */
export function isOnlyOriginResponse(text) {
  return isPureOriginReply(text);
}

/**
 * Marca que se pidió introducción
 */
export function markIdentityAsked(chatId, field) {
  markIntroAsked(chatId, field);
}
