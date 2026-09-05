# W.I.L Pay

PWA de crédito direto com fluxo objetivo de análise e acompanhamento.

## Fluxo do cliente
1. Cria a conta.
2. Responde um questionário rápido de crédito.
3. Envia documento com foto, comprovante de residência e selfie com documento.
4. Solicita análise.
5. Se aprovado, informa a chave PIX.
6. O administrador recebe o PIX e tem o prazo configurado para realizar a liberação.
7. O administrador anexa o comprovante da transferência.
8. O sistema gera automaticamente 2 parcelas: a primeira em 15 dias e a segunda em 30 dias.
9. O cliente acompanha datas, pagamentos e evolução do W.I.L Score.

## Score
- A: 850–1000
- B: 700–849
- C: 550–699
- D: 400–549
- E: 1–399

Pagamentos no prazo aumentam pontos. Atrasos reduzem pontos. A quitação do ciclo gera bônus. O administrador também pode ajustar a pontuação manualmente.

## Central administrativa
- Fila de análises.
- Visualização das respostas do questionário e documentos.
- Aprovar, recusar ou excluir solicitação.
- Acompanhar clientes aprovados aguardando PIX.
- Contador do prazo de liberação.
- Upload do comprovante da transferência.
- Geração automática das 2 parcelas quinzenais.
- Registro de recebimento e atualização automática do score.
- Score A/B/C/D/E por cliente com pontuação de 1 a 1000.
- Opção de excluir os dados operacionais de um cliente.

## Stack
React + Vite + Aureon Base + PWA + GitHub Pages.
