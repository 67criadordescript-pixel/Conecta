# Histórico de alterações

## 3.2.0 — Compartilhamento de tela
- Adicionado botão de compartilhamento de tela com permissão explícita do navegador.
- Vídeo transmitido entre dispositivos da mesma sala via WebRTC; servidor usa WebSocket somente para sinalização.
- Implementado limite de um compartilhamento ativo por sala, validação de destinatário e limites próprios para mensagens de sinalização.
- Tratados encerramento pelo usuário, término da faixa de captura e desconexão.
- Atualizados testes automatizados e documentação de privacidade/implantação.
- Limitação conhecida: redes restritivas podem exigir TURN; teste real de mídia entre dispositivos ainda deve ser realizado após publicar.

## 3.3.0 — Painel administrativo com privacidade
- Adiciona `/admin` com autenticação, sessão HttpOnly/SameSite e limite de tentativas.
- Exibe salas, dispositivos, mensagens recentes, metadados de arquivos e estado de compartilhamento de tela.
- Histórico limitado a 500 eventos em memória; não armazena bytes de arquivos nem vídeo de tela.
- Atualiza documentação de implantação e privacidade.


## Conecta 3.4
- Login administrativo com e-mail autorizado (`ADMIN_EMAIL`) e senha (`ADMIN_PASSWORD`) configurados no ambiente do servidor.
- A interface principal não exibe botão ou link para o painel; o acesso é pelo endereço `/admin`.
- Credenciais não são gravadas no código ou no ZIP.
