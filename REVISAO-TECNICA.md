# Relatório de revisão técnica — Conecta 3.3

## Verificações executadas neste pacote
- `node --check server.js`: passou.
- `node --check test.js`: passou.
- Sintaxe do JavaScript inline do navegador: passou.
- HTML analisado, IDs duplicados: nenhum encontrado.
- Links de Termos e Privacidade presentes: confirmado.
- Validação do código de sala (8–32 caracteres) no navegador: confirmada.
- Health check `/healthz` configurado no Render: confirmado.
- ZIP final: integridade conferida após empacotamento.

## Testes que ainda precisam ser executados no ambiente com dependências
O teste de integração `npm test` usa o pacote `ws`, listado em `package.json`. Não foi possível instalar a dependência neste ambiente de revisão porque o acesso ao registro npm não estava disponível; portanto, o teste HTTP/WebSocket de integração não foi executado aqui. Após `npm install`, execute `npm test` antes de divulgar o serviço e teste também dois navegadores reais em redes/dispositivos diferentes.

## Limitações e itens obrigatórios antes da publicação pública
1. Preencher a identidade do responsável e um e-mail de contato monitorado nos documentos/política do site.
2. Solicitar revisão jurídica dos termos e da política conforme a operação real e a LGPD. Os textos incluídos são modelos, não garantia contra ações judiciais.
3. Configurar domínio próprio, DNS, TLS e Cloudflare no painel; isso não pode ser ativado só com código.
4. Testar WebSocket, reconexão, mensagens, arquivos de 8 MB, sala cheia, código inválido, celular/tablet e navegadores suportados no Render real.
5. O sistema usa código de sala compartilhado, sem contas de usuário nem criptografia ponta a ponta; não use para informações confidenciais.
6. Limites por IP são locais à instância e não substituem rate limiting distribuído, monitoramento ou teste de invasão independente.
7. O servidor não faz análise antivírus de arquivos e não grava histórico persistente.

## Plano de teste manual pós-deploy
- Abrir `/`, `/terms`, `/privacy`, `/healthz` e uma rota inexistente (esperar 404).
- Conectar dois dispositivos com o mesmo código de sala aleatório e confirmar lista online.
- Enviar mensagens com acentos, emoji, texto longo, espaços e caracteres HTML; verificar que aparecem como texto e não como HTML executável.
- Enviar arquivos pequenos e um arquivo próximo de 8 MB; tentar arquivo maior que 8 MB e confirmar rejeição.
- Desconectar rede ou reiniciar o serviço e verificar as tentativas automáticas de reconexão.
- Testar sala com código inválido, limite de participantes e múltiplos dispositivos atrás da mesma rede.
- Verificar logs, eventos de segurança Cloudflare e uso de CPU/memória no Render.

## Compartilhamento de tela (implementação atual)
- Captura via `navigator.mediaDevices.getDisplayMedia`, iniciada somente por clique explícito e escolha do usuário no seletor nativo do navegador.
- Vídeo transmitido por WebRTC entre pares; o servidor retransmite apenas sinalização autenticada à mesma sala.
- Apenas um compartilhamento ativo por sala; validação de sala/destinatário, limites de tamanho e limite separado de mensagens de sinalização.
- Encerramento tratado por botão, evento `ended` da faixa de vídeo, desconexão WebSocket e encerramento da sessão.
- STUN está configurado para facilitar a conectividade. Redes restritivas podem exigir TURN; conectividade universal não pode ser garantida sem um serviço TURN gerenciado e testado.
- Testes automatizados incluem os caminhos de sinalização do servidor quando as dependências estão instaladas. Teste real de mídia entre navegadores/dispositivos ainda deve ser realizado após o deploy.


## Painel administrativo (versão 3.3)
- Endpoint `/admin`, login em `/admin/login`, estado em `/admin/api/state`, logout em `/admin/logout`.
- O painel fica desativado se `ADMIN_PASSWORD` tiver menos de 16 caracteres. Configure uma senha aleatória como segredo no Render.
- Sessões aleatórias em memória, cookie HttpOnly/SameSite=Strict, Secure em HTTPS, comparação de senha em tempo constante, limite de tentativas por IP e endpoints sem cache.
- O histórico limita-se a 500 eventos em memória. Texto de mensagens e metadados de arquivos são visíveis a administradores autenticados; bytes de arquivos não são armazenados pelo painel. Reiniciar o processo limpa eventos e salas lembradas.
- Por privacidade, o painel exibe apenas o estado do compartilhamento de tela, não o vídeo. Não existe captura ou gravação de tela pelo administrador.
- Antes de uso público, atualize a política de privacidade e informe os participantes sobre a existência e finalidade do painel.
