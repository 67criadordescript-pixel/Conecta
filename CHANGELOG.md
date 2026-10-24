# Histórico de alterações

## 3.2.1 — Retorno sem painel e revisão
- Removidos painel administrativo, login administrativo, rotas e configurações de senha de administrador.
- Mantida a base 3.2 de chat, transferência de arquivos e compartilhamento de tela via WebRTC.
- Revisada a documentação para refletir o comportamento sem painel e sem histórico administrativo.
- Acrescentado teste automatizado que confirma que `/admin` retorna 404.
- Preservados limites, validações, cabeçalhos de segurança, reconexão e ícone de pasta animado.

## 3.2.0 — Compartilhamento de tela
- Adicionado botão de compartilhamento de tela com permissão explícita do navegador.
- Vídeo transmitido entre dispositivos da mesma sala via WebRTC; servidor usa WebSocket somente para sinalização.
- Implementado limite de um compartilhamento ativo por sala, validação de destinatário e limites próprios para mensagens de sinalização.
- Tratados encerramento pelo usuário, término da faixa de captura e desconexão.
- Limitação conhecida: redes restritivas podem exigir TURN; o teste automatizado valida a sinalização, não substitui um teste real de mídia entre dispositivos.
