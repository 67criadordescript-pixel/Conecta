# Conecta 3.2.1 — chat, arquivos e compartilhamento de tela

Aplicação Node.js/WebSocket para conversar e transferir arquivos temporariamente entre dispositivos conectados à mesma sala. Funciona em navegadores modernos de computador, tablet e celular e pode ser hospedada no Render.

## O que esta versão inclui
- Chat em tempo real, busca local de mensagens e lista de dispositivos conectados.
- Envio de arquivos de até 8 MB por arquivo.
- Compartilhamento de tela com autorização explícita do navegador, usando WebRTC entre os dispositivos.
- Ícone de pasta animado para envio de arquivos e interface responsiva.
- Reconexão automática com espera progressiva, controles para desconectar e encerramento de compartilhamento.
- Validação de mensagens e sinalização WebRTC, limites por IP/sala, limite de mensagens, heartbeat WebSocket e cabeçalhos HTTP de segurança.
- Rotas `/terms`, `/privacy`, `/healthz`, página 404 e testes automatizados.
- **Não possui painel administrativo, login de administrador, endpoint `/admin` ou variável `ADMIN_PASSWORD`.**

## Publicar no Render
1. Extraia o ZIP e envie os arquivos diretamente para a raiz do repositório GitHub (não envie uma pasta extra envolvendo todos os arquivos).
2. No Render, configure o serviço para usar esse repositório e a raiz correta.
3. Build Command: `npm install`.
4. Start Command: `npm start`.
5. Health Check Path: `/healthz`.
6. Faça um novo deploy e aguarde o status `Live`.
7. Teste em dois dispositivos: entre na mesma sala, envie mensagens/arquivo e teste o compartilhamento de tela.

## Variáveis opcionais
- `CONTACT_EMAIL`: endereço de contato real e monitorado, exibido nas páginas legais.
- `MAX_CLIENTS` (padrão 250).
- `MAX_CONNECTIONS_PER_IP` (padrão 12).
- `MAX_DEVICES_PER_ROOM` (padrão 10).
- `MESSAGE_LIMIT_PER_SECOND` (padrão 8).
- `ALLOWED_ORIGINS`: lista separada por vírgulas de origens exatas que você controla; deixe sem configurar se não precisar de origens adicionais.

## Segurança e limites
- O código da sala tem de 8 a 32 caracteres (`A-Z`, `a-z`, números, hífen e sublinhado). Ele funciona como segredo compartilhado, não como identidade verificada; use um código exclusivo e difícil de adivinhar.
- O servidor retransmite mensagens e arquivos. **Não há criptografia ponta a ponta**, armazenamento permanente ou análise antivírus dos arquivos.
- Mensagens e arquivos ficam na memória durante a retransmissão; o servidor não mantém histórico em banco de dados. O provedor de hospedagem pode manter seus próprios logs operacionais.
- O limite de arquivo é 8 MB. Não envie senhas, dados sensíveis ou arquivos confidenciais.
- O compartilhamento de tela começa somente após ação explícita do usuário. O vídeo trafega por WebRTC; o servidor encaminha apenas a sinalização. Algumas redes podem exigir infraestrutura TURN para conexões confiáveis.
- O CSP permite scripts inline porque a interface atual contém JavaScript inline. A aplicação não substitui auditoria independente nem monitoramento operacional.

## Documentos legais
`/terms` e `/privacy` são modelos informativos, não aconselhamento jurídico. Antes de publicar, identifique o responsável, configure `CONTACT_EMAIL`, revise a coleta real da hospedagem/CDN e peça revisão jurídica adequada à LGPD. Não publique declarações que não correspondam ao funcionamento real.

## Testes
Execute `npm install` e depois `npm test` em ambiente com Node.js 20 ou superior.

Consulte `DEPLOY-RENDER.txt` e `CLOUDFLARE.md` para detalhes adicionais. A proteção da Cloudflare não é ativada apenas por estes arquivos: depende de domínio e configuração no painel do provedor.
