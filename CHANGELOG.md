# Histórico de alterações

## 3.2.0 — Compartilhamento de tela
- Adicionado botão de compartilhamento de tela com permissão explícita do navegador.
- Vídeo transmitido entre dispositivos da mesma sala via WebRTC; servidor usa WebSocket somente para sinalização.
- Implementado limite de um compartilhamento ativo por sala, validação de destinatário e limites próprios para mensagens de sinalização.
- Tratados encerramento pelo usuário, término da faixa de captura e desconexão.
- Atualizados testes automatizados e documentação de privacidade/implantação.
- Limitação conhecida: redes restritivas podem exigir TURN; teste real de mídia entre dispositivos ainda deve ser realizado após publicar.
