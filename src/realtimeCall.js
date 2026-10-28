// src/realtimeCall.js
//
// Todo lo que hace falta para la llamada de voz (SDK Realtime, zod y el agente de
// la entrevista) en un solo módulo que se carga con import(): pesa más de 1 MB y
// solo se usa cuando la persona toca el micrófono. Ver loadRealtimeCall().
export { RealtimeSession, OpenAIRealtimeWebRTC } from '@openai/agents-realtime';
export { buildInterviewAgent } from './interviewAgent';
