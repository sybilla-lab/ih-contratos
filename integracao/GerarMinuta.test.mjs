import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const script = {};
runInNewContext(readFileSync(new URL("./GerarMinuta.gs", import.meta.url), "utf8"), script);

test("usa o mês da emissão e rejeita datas inexistentes", () => {
  assert.equal(script.nomeMesEmissao_("2026-12-01"), "dez26");
  assert.throws(() => script.nomeMesEmissao_("2026-02-29"), /inválida/);
});

test("localiza pelo ID mesmo quando as linhas mudam de ordem", () => {
  const linhas = [["ID da solicitação", "Projeto"], ["SOL-2", "Outro"], ["SOL-1", "Alimenta"]];
  const aba = {
    getLastRow: () => 6,
    getLastColumn: () => 2,
    getRange: () => ({ getDisplayValues: () => linhas.slice() }),
  };
  const planilha = { getSheetByName: () => aba };
  assert.equal(script.buscarSolicitacao_(planilha, "Base", 4, "SOL-1").Projeto, "Alimenta");
  linhas.push(["SOL-1", "Duplicado"]);
  assert.throws(() => script.buscarSolicitacao_(planilha, "Base", 4, "SOL-1"), /uma vez/);
});

test("retorna um erro claro para uma aba sem solicitações", () => {
  const planilha = { getSheetByName: () => ({ getLastRow: () => 4 }) };
  assert.throws(() => script.buscarSolicitacao_(planilha, "Base", 4, "SOL-1"), /não tem solicitações/);
});
