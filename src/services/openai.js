import OpenAI from 'openai';
import { OPENAI_API_KEY } from '../config.js';

// Si Node < 18, descomentar:
// import fetch from 'node-fetch';
// globalThis.fetch = fetch;
export const oa = new OpenAI({ apiKey: OPENAI_API_KEY });
