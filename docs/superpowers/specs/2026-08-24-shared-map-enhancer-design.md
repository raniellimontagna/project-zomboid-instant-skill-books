# Shared Map Enhancer B42 — Design

## Objetivo

O Shared Map Enhancer é o terceiro mod independente deste repositório multi-mod. Ele sincroniza marcadores úteis entre jogadores de uma sessão cooperativa pequena, sem transformar o mapa em um sistema de tarefas, recompensas ou rastreamento.

O alvo é Project Zomboid Build 42.20+. Toda alteração persistente é server-authoritative: o cliente solicita uma intenção e exibe o estado confirmado pelo servidor.

## Escopo do MVP

Cada jogador pode criar um marcador no mapa principal ou minimapa com:

- categoria `Base`, `Loot`, `Danger`, `Vehicle`, `Medicine`, `Fuel` ou `Expedition`;
- título de até 80 caracteres;
- nota opcional de até 240 caracteres;
- cor e ícone escolhidos de listas permitidas pelo servidor;
- coordenadas `x`, `y` e `z` do mapa;
- duração permanente ou expiração futura.

O criador pode editar e remover os próprios marcadores. Um administrador pode remover qualquer marcador. Marcadores expirados deixam de ser exibidos e são removidos durante a limpeza do servidor.

O mod não implementa tarefas, atribuição de responsáveis, recompensas, contratos, progressão, rastreamento em tempo real, rotas automáticas, integração obrigatória com Discord, concessão de itens ou edição do mundo.

## Arquitetura

O mod será separado em quatro camadas:

1. **Validação compartilhada** — categorias, limites, cores, ícones, coordenadas, expiração e formato de snapshots/deltas.
2. **Servidor** — registro persistente, geração de IDs, autorização, idempotência, expiração e sincronização.
3. **Cliente** — menu/formulário, cache local, filtros e integração com a API vanilla de símbolos.
4. **Contrato de testes** — fixtures Fengari para a lógica pura e seams B42 para rede/persistência/renderização.

O cliente não poderá enviar ou escolher de forma confiável `id`, `createdBy`, `createdAt` ou `expiresAt`. Esses campos serão sempre derivados ou confirmados pelo servidor.

## Modelo de dados

O registro lógico de um marcador será:

```text
id          string gerada pelo servidor
category    categoria permitida
title       string não vazia, máximo de 80 caracteres
note        string opcional, máximo de 240 caracteres
icon        identificador de símbolo permitido
color       identificador de cor permitido
x, y, z     coordenadas inteiras do mundo
createdBy   identificador do jogador criador
createdAt   timestamp do servidor
expiresAt   nil ou timestamp futuro
revision    inteiro crescente do registro
```

O servidor manterá os registros em `ModData` global com namespace próprio, por exemplo `SharedMapEnhancer`. O formato persistido será uma tabela indexada por `id`, com versão de schema para migrações futuras.

Limites de segurança do MVP:

- no máximo 500 marcadores persistidos;
- no máximo uma mutação por jogador a cada segundo;
- `requestId` obrigatório, entre 1 e 64 caracteres, com cache de idempotência por jogador;
- somente coordenadas inteiras finitas dentro dos limites do mapa;
- expiração `permanent`, `1h`, `8h`, `24h` ou `7d`, convertida pelo servidor em timestamp;
- campos extras, tipos errados e listas desconhecidas são rejeitados sem mutação parcial.

As cores permitidas são `white`, `red`, `orange`, `yellow`, `green`, `cyan`, `blue` e `purple`. Os ícones permitidos no MVP são `House`, `Target`, `Skull`, `SteeringWheel`, `MedCross`, `Fuel`, `Tent`, `Question`, `Star`, `Cross` e `Exclamation`, todos resolvidos contra `MapSymbolDefinitions` do B42.

## Contrato de rede

O cliente envia apenas intenções no módulo `SharedMapEnhancer`:

```text
create  { requestId, category, title, note, icon, color, x, y, z, duration }
update  { requestId, id, category, title, note, icon, color, duration }
remove  { requestId, id }
request { requestId }
```

`duration` representa uma opção de duração aprovada pelo servidor, não um timestamp arbitrário. O servidor converte essa opção em `expiresAt`.

O servidor responde no mesmo módulo com:

```text
snapshot { requestId, revision, markers = [...] }
delta    { revision, operation = "create" | "update" | "remove", marker = {...} | id }
error    { requestId, code }
```

Cada resposta contém somente dados validados. Operações repetidas com o mesmo `requestId` retornam o resultado já confirmado e não criam alterações duplicadas.

## Autorização e ciclo de vida

- `create`: qualquer jogador conectado, sujeito a limites e formato válido;
- `update`: somente o jogador cujo `createdBy` corresponde ao jogador autenticado;
- `remove`: criador correspondente ou administrador;
- `request`: qualquer jogador conectado.

O servidor rejeita marcadores expirados durante leitura e limpeza. A limpeza roda em evento periódico do servidor e antes de construir snapshots. Uma falha ao remover um registro expirado não invalida os demais registros válidos.

## Persistência e sincronização

O servidor carrega ou cria o `ModData` do mod no início do save. No MVP, o snapshot contém todos os marcadores não expirados, limitado aos 500 registros persistidos; isso é apropriado para as sessões cooperativas pequenas do projeto. Após uma mutação aceita, ele persiste a revisão e transmite um delta aos clientes conectados. Ao entrar, abrir o mapa ou pedir atualização, o cliente recebe um snapshot validado; uma futura otimização poderá filtrar por área usando a posição autenticada do jogador, nunca coordenadas fornecidas pelo cliente.

O cliente mantém um cache por `id` e aplica deltas somente quando a revisão é válida. Se detectar lacuna de revisão, resposta inválida ou falha de sincronização, descarta o delta e solicita um novo snapshot. Marcadores fora do viewport atual são mantidos no cache, mas não são desenhados.

## Integração com o mapa

O cliente usará as APIs vanilla `UIWorldMap`/`symbolsAPI` e as definições existentes de `MapSymbolDefinitions`. O mod não substituirá a tela inteira do mapa e não apagará anotações vanilla.

Cada símbolo desenhado pelo mod será rastreável pelo `id` do marcador. Ao reconstruir a camada, o cliente remove somente símbolos pertencentes ao namespace do mod e recria os símbolos confirmados do cache. O mapa principal e o minimapa usam o mesmo cache e os mesmos filtros de categoria.

As cores serão convertidas de identificadores estáveis para RGBA no cliente. Os ícones serão selecionados de IDs vanilla previamente registrados; ícones ausentes ou desconhecidos usam um fallback seguro e não interrompem a renderização dos demais marcadores.

## Falhas e segurança

- O servidor valida todos os campos novamente, mesmo que o cliente já tenha validado localmente.
- Textos, categorias, cores, ícones, duração e coordenadas inválidos produzem erro localizado e nenhuma escrita.
- O cliente nunca trata uma resposta local como confirmação antes do snapshot/delta do servidor.
- Corrupção de um marcador isolado não impede o carregamento dos outros.
- O mod não usa comandos que criem itens, alterem o mundo ou concedam permissões.
- Eventos de sincronização ausentes ou APIs B42 incompatíveis resultam em falha fechada, preservando as anotações vanilla.

## Testes e aceitação

Antes do teste multiplayer, o pacote automatizado cobrirá:

- validação de categorias, texto, cor, ícone, coordenadas e duração;
- rejeição de campos extras, tipos hostis e timestamps enviados pelo cliente;
- autorização de criador versus administrador;
- limites por save, rate limit e idempotência;
- criação, edição, remoção, expiração e limpeza;
- snapshots, deltas, revisões e recuperação por snapshot;
- filtros de categoria e reconstrução sem apagar símbolos vanilla;
- paridade exata do pacote ZIP com `mods/SharedMapEnhancer/42/`.

O teste multiplayer B42.20+ validará: criação por um jogador, visualização pelo segundo, filtros independentes, edição pelo criador, tentativa de edição por outro jogador, remoção administrativa, expiração, entrada de um terceiro jogador e persistência após reinício do servidor.

## Entregáveis

- `mods/SharedMapEnhancer/42/` com identidade própria;
- documentação e opções de instalação próprias;
- pacote local `outputs/SharedMapEnhancer-0.1.0.zip`;
- testes em `work/shared-map-enhancer-tests/`;
- nenhuma alteração no ID ou no pacote publicado do Instant Skill Books;
- nenhum Workshop ID inventado até a criação do item separado na Steam Workshop.
