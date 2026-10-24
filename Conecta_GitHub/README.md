# Conecta

Chat e envio de arquivos entre dispositivos, com conexão automática e salas privadas por código. Compatível com navegadores modernos em PC, Android e tablet.

## Publicar sem usar comandos

**Importante:** o GitHub guarda o código, mas o GitHub Pages não executa o servidor WebSocket. Para o app funcionar online, publique o repositório no GitHub e conecte-o ao Render:

1. Crie uma conta em https://github.com e um repositório chamado `Conecta`.
2. Envie os arquivos desta pasta ao repositório usando **Add file → Upload files** no site do GitHub. Não precisa abrir terminal.
3. Entre em https://render.com e escolha **New → Blueprint** (ou crie um **Web Service**), conecte o repositório `Conecta` e confirme a implantação usando `render.yaml`.
4. Aguarde a implantação e abra o endereço `https://...onrender.com` fornecido pelo Render.
5. Abra exatamente esse mesmo endereço no PC e no tablet. Em ambos, digite o mesmo código de sala (4–32 caracteres: letras sem acentos, números, `_` ou `-`) e toque em **Conectar**. O endereço do servidor é detectado automaticamente; não precisa digitar IP, porta ou comandos no tablet.

No plano gratuito, o serviço pode demorar um pouco para acordar após ficar inativo. A primeira conexão pode levar até um minuto.

## Uso local no Windows (opcional)

Se quiser executar na rede local, instale Node.js LTS, dê duplo clique em `iniciar.bat` e abra o endereço local mostrado no PC. O tablet e o PC precisam estar na mesma rede Wi-Fi. Para publicação online, prefira o endereço HTTPS do Render.

## Recursos e limites

- Mensagens em tempo real e lista de dispositivos por sala.
- Envio de arquivos até 8 MB.
- O conteúdo é retransmitido pelo servidor; não é criptografia ponta a ponta.
- O código da sala é uma chave compartilhada: não use códigos fáceis ou dados pessoais. Qualquer pessoa que souber o código poderá entrar na sala.
- O conteúdo das salas existe apenas enquanto os dispositivos estão conectados; não há histórico persistente.
- Bluetooth usa Web Bluetooth quando o navegador e o dispositivo oferecem suporte; não é transferência genérica de arquivos por Bluetooth.

## Licença

Escolha uma licença antes de distribuir publicamente. Nenhuma licença foi presumida neste pacote.
