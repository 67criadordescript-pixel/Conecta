# Cloudflare — configuração recomendada

Cloudflare não pode ser ativada apenas por código. É necessário ter um domínio próprio e acesso ao painel DNS do registrador.

1. Adicione o domínio à conta Cloudflare e siga o assistente para trocar os nameservers no registrador.
2. Em DNS, crie o registro indicado pela Cloudflare para o domínio/subdomínio. Para um serviço Render, siga a documentação atual do Render para custom domains e use exatamente o destino informado pelo painel Render; não invente um CNAME.
3. Configure o domínio personalizado no serviço Web do Render e aguarde o certificado TLS ficar válido.
4. Para o registro do domínio do site, habilite proxy Cloudflare (nuvem laranja) quando suportado pela configuração recomendada. Não proxie registros de e-mail.
5. SSL/TLS: use Full (strict) quando o certificado da origem estiver válido. Nunca use Flexible para um site com HTTPS na origem.
6. Ative Always Use HTTPS e configure HSTS somente depois de confirmar que HTTPS funciona para todo o domínio e subdomínios necessários. HSTS pode dificultar reversão se ativado cedo.
7. Em Security/WAF, habilite regras gerenciadas disponíveis no seu plano e crie regras conservadoras para limitar tráfego abusivo. Teste regras antes de bloquear tráfego legítimo. Rate limiting e algumas regras dependem do plano.
8. WebSockets precisam estar permitidos na Cloudflare; não crie regra que bloqueie o caminho `/` com Upgrade: websocket.
9. Teste conexão e troca de arquivos nos dispositivos reais depois de ativar proxy/WAF. Veja Security Events e os logs do Render se falhar.
10. Nunca coloque tokens API, chaves secretas ou credenciais Cloudflare no código público/GitHub.

Limitações importantes:
- Cloudflare reduz exposição e filtra parte do tráfego, mas não garante proteção contra todos os ataques. Consulte as instruções oficiais atuais: https://render.com/docs/configure-cloudflare-dns e https://developers.cloudflare.com/network/websockets/.
- A proteção do domínio próprio não cobre automaticamente o endereço `*.onrender.com`. Não divulgue nem use a URL direta do Render como endereço público principal se quiser que o tráfego passe pela Cloudflare. Verifique com o Render se a origem pode ser restringida para aceitar apenas tráfego da Cloudflare no seu plano/configuração.
- Esta aplicação ainda usa códigos de sala como credencial compartilhada; qualquer pessoa com o código pode tentar acessar a sala. Use códigos aleatórios e não reutilize códigos entre conversas sensíveis.
