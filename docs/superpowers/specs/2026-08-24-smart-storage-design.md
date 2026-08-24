# Smart Storage B42 — Design

**Status:** aprovado para especificação em 2026-08-24  
**Target:** Project Zomboid Build 42.20+  
**Mod ID:** `SmartStorage`  
**Workshop:** item próprio, separado de `InstantSkillBooks`

## Objetivo

Smart Storage é um mod independente para sessões cooperativas pequenas. Ele adiciona uma ação **Depositar itens compatíveis** ao inventário do jogador e organiza apenas itens elegíveis em contêineres próximos, usando categorias configuráveis pelo servidor.

O mod reduz cliques repetitivos sem criar itens, vasculhar o mapa inteiro ou mover objetos em segundo plano. Toda alteração de inventário é validada e executada no servidor.

## Decisões aprovadas

- O repositório será um monorepo para vários mods, mas cada mod terá código, identidade, testes, documentação, versão e pacote independentes.
- O Smart Storage usa tipos de contêiner, não nomes personalizados de caixas ou armários.
- As categorias são híbridas: categoria vanilla quando confiável, tags vanilla quando disponíveis e allowlists explícitas para casos sem sinal vanilla estável.
- Cada categoria é ativada individualmente nas opções do servidor.
- Itens que correspondem a mais de uma categoria usam uma prioridade configurável.
- O cliente solicita uma intenção; o servidor não confia em IDs de destino, listas de itens ou classificações enviadas pelo cliente.

## Organização do monorepo

```text
mods/
  InstantSkillBooks/
    42/
  SmartStorage/
    42/
work/
  instant-skill-books-tests/
  smart-storage-tests/
docs/
  superpowers/specs/
  superpowers/plans/
outputs/
  InstantSkillBooks/
  SmartStorage/
```

A migração de `InstantSkillBooks/` para `mods/InstantSkillBooks/` altera apenas o caminho de desenvolvimento. O layout dentro do ZIP continuará `Contents/mods/InstantSkillBooks/42/`, preservando o Mod ID e o Workshop ID existentes. O README da raiz se tornará um índice dos mods, com documentação detalhada por mod.

## Categorias e opções

As seguintes categorias ficam disponíveis individualmente:

| Chave | Rótulo | Padrão | Sinal de classificação |
|---|---|---:|---|
| `Food` | Comida | ligado | `item:getCategory() == "Food"` |
| `Tools` | Ferramentas | ligado | allowlist de tags de ferramentas |
| `Medicine` | Medicamentos | ligado | allowlist explícita de tipos verificados |
| `Construction` | Construção | ligado | tags e allowlist de materiais verificados |
| `Weapons` | Armas | desligado | `item:getCategory() == "Weapon"` |
| `Ammo` | Munição | desligado | tags `AMMO`, carregadores e cartuchos |
| `Clothing` | Roupas | desligado | `item:getCategory() == "Clothing"` |
| `Literature` | Literatura | desligado | `item:getCategory() == "Literature"` |
| `Fuel` | Combustível | desligado | tags vanilla de combustível |
| `Farming` | Agricultura | desligado | tags de sementes, fertilizante e compostagem |
| `Fishing` | Pesca | desligado | tags de vara, linha e anzol |

As chaves de configuração serão `SmartStorage.<Category>`. O servidor também terá:

- `SearchRadius` — raio inteiro em quadrados para procurar destinos;
- `MaxItemsPerRequest` — teto de itens processados por solicitação;
- `LowConditionPercent` — limite de condição abaixo do qual o item fica protegido;
- `CategoryPriority` — lista ordenada usada quando um item corresponde a mais de uma categoria;
- uma opção de texto por categoria para os tipos de contêiner aceitos, em lista separada por vírgulas;
- allowlists de tipos para Medicamentos e Construção, também em texto separado por vírgulas.

Os valores padrão de tipos de contêiner serão definidos somente depois de verificar os identificadores reais do Build 42.20. IDs desconhecidos são ignorados e nunca viram destino válido. A implementação não usará heurística pelo nome exibido do item.

## Classificação

O servidor classifica cada item nesta ordem:

1. allowlist explícita de tipo completo;
2. tags vanilla;
3. categoria vanilla;
4. nenhum destino quando o resultado é desconhecido ou ambíguo.

Somente categorias ativas entram na decisão. Se houver várias correspondências, a primeira categoria ativa em `CategoryPriority` vence. A classificação é uma função pura separada do código de rede e transferência para ser testada sem o jogo.

## Fluxo cliente-servidor

1. O cliente adiciona **Depositar itens compatíveis** ao contexto do inventário quando o jogador tem itens candidatos.
2. O cliente envia `SmartStorage/deposit` com a categoria solicitada e um identificador de requisição local.
3. O servidor obtém o personagem associado à conexão e ignora qualquer inventário, item ou contêiner fornecido pelo cliente.
4. O servidor percorre o inventário do jogador e os inventários de bolsas pertencentes a ele; não percorre o mapa inteiro.
5. O servidor procura contêineres próximos em quadrados carregados, respeitando raio, acesso e tipos configurados.
6. Destinos são ordenados por distância e posição estável para que o resultado seja determinístico.
7. Antes de cada transferência, o servidor revalida posse, origem, distância, acesso, capacidade e compatibilidade de categoria.
8. A transferência usa as operações normais de inventário e os mecanismos vanilla de sincronização.
9. O servidor responde `SmartStorage/result` com contagens de movidos, protegidos, sem destino e falhas.

O servidor limita cada jogador a uma solicitação por segundo e a `MaxItemsPerRequest` itens por rodada. Repetições do mesmo identificador de requisição são ignoradas ou retornam o mesmo resumo, evitando duplicação por clique duplo ou reenvio de pacote.

## Proteções

Um item não será movido se estiver:

- equipado ou vestido;
- marcado como favorito;
- quebrado ou abaixo de `LowConditionPercent`;
- dentro de um recipiente que não pertence ao inventário do jogador;
- dentro de um recipiente com conteúdo, para evitar mover uma bolsa cheia como item simples;
- sem categoria única ou sem destino compatível;
- ausente da origem no momento da validação.

O MVP não move itens no chão, recipientes de veículos, itens de outros jogadores ou recipientes não acessíveis. Não há criação, remoção arbitrária, reparo, alteração de condição ou alteração de quantidade.

## Interface e resultado

O MVP terá apenas a ação no contexto do inventário e uma mensagem curta de resultado. Não haverá janela persistente, painel de base ou ordenação automática em segundo plano. A mensagem mostrará, no mínimo:

```text
Movidos: N | Protegidos: N | Sem destino: N | Falhas: N
```

## Testes e aceitação

Antes do teste no jogo, os testes automatizados devem cobrir:

- classificação por categoria vanilla, tag e allowlist;
- prioridade quando um item corresponde a várias categorias;
- categorias desativadas e sinais desconhecidos;
- exclusão de equipados, favoritos, baixa condição e recipientes com conteúdo;
- seleção por distância, tipo, capacidade e acesso;
- rejeição de origem/itens falsos enviados pelo cliente;
- limite de taxa, teto por requisição e idempotência;
- resumo determinístico de movidos, protegidos, sem destino e falhas;
- sandbox metadata, traduções, versão e pacote do mod.

Aceitação ao vivo exige uma sessão Build 42.20+ com servidor e dois clientes: verificar categorias independentes, contêineres cheios, itens protegidos, reenvio de comando, jogador entrando depois e ausência de alterações fora do raio.

## Não-objetivos do MVP

- varredura de toda a base ou do mapa;
- classificação por nome de item ou heurística frágil;
- ordenação automática em segundo plano;
- retirada de itens (withdraw);
- listas por contêiner, presets ou legendas de armazenamento;
- tarefas, recompensas, permissões hierárquicas ou integração com Discord;
- alterações de mundo, criação de itens ou economia.

