/**
 * Piloto mensal ENAP. Configure PLANILHA_CONTRATOS_ID, MODELO_ENAP_MENSAL_ID e PASTA_MINUTAS_ID.
 * Execute como o usuário que acessa o app e restrinja o acesso à equipe.
 */
function gerarMinutaEnap(idSolicitacao, cartao, dataEmissao) {
  const id = String(idSolicitacao || '').trim();
  if (!id) throw new Error('Informe o ID da solicitação.');
  const { PASTA_MINUTAS_ID, PLANILHA_CONTRATOS_ID, MODELO_ENAP_MENSAL_ID } =
    PropertiesService.getScriptProperties().getProperties();
  if (!PASTA_MINUTAS_ID || !PLANILHA_CONTRATOS_ID || !MODELO_ENAP_MENSAL_ID) {
    throw new Error('Configure os IDs da planilha, do modelo e da pasta de destino.');
  }
  const anoMes = nomeMesEmissao_(dataEmissao);

  const planilha = SpreadsheetApp.openById(PLANILHA_CONTRATOS_ID);
  const base = buscarSolicitacao_(planilha, 'Base Geral de Contratos', 4, id);
  const resposta = buscarSolicitacao_(planilha, 'Respostas ao formulário 1', 1, id);
  const digitos = valor => String(valor || '').replace(/\D/g, '');
  if (digitos(base['CNPJ contratante']) !== '18702797000134' ||
      !/enap/i.test(base['Parceria/Programa'] + ' ' + base.Financiador) ||
      !/membro|mensal|recorrente/i.test(base['Tipo de contratação'])) {
    throw new Error('O piloto atende às contratações recorrentes ENAP da Associação Impact Hub Brasil.');
  }

  const fornecedor = String(cartao && cartao.razaoSocial || '').trim();
  const cnpj = digitos(cartao && cartao.cnpj);
  const projeto = base.Projeto;
  if (!fornecedor || !projeto || cnpj.length !== 14 || cnpj !== digitos(resposta.CNPJ)) {
    throw new Error('Confira o projeto e a razão social e o CNPJ do fornecedor no Cartão CNPJ.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const raiz = DriveApp.getFolderById(PASTA_MINUTAS_ID);
    const nomePasta = 'Solicitação ' + id;
    const pastas = raiz.getFoldersByName(nomePasta);
    const pasta = pastas.hasNext() ? pastas.next() : raiz.createFolder(nomePasta);
    const arquivos = pasta.getFilesByType(MimeType.GOOGLE_DOCS);
    let arquivo = arquivos.hasNext() ? arquivos.next() : null;
    if (arquivos.hasNext()) throw new Error('Há mais de um documento na pasta da solicitação.');

    if (!arquivo) {
      const nome = ['Contrato Prestação de Serviços', fornecedor, projeto, anoMes].join(' _ ');
      const modelo = DriveApp.getFileById(MODELO_ENAP_MENSAL_ID);
      arquivo = modelo.makeCopy(nome, pasta);
      try {
        const doc = DocumentApp.openById(arquivo.getId());
        const corpo = doc.getBody();
        const campos = {
          '[NOME EMPRESARIAL DA CONTRATADA]': fornecedor,
          '[CNPJ]': cartao.cnpj,
          '[ENDEREÇO COMPLETO E CEP]': cartao.enderecoCompleto,
          '[E-MAIL]': resposta['E-mail do Fornecedor ou Prestador de Serviço'],
          '[DESCRIÇÃO DO OBJETO]': resposta['Descrição do Objeto da contratação'],
          '[REFERÊNCIA AO PROJETO]': projeto,
          '[Nome do Projeto]': projeto,
          '[DATA DE INÍCIO]': base['Início da vigência'],
          '[DATA DE TÉRMINO]': base['Término da vigência'],
        };
        for (const [campo, valor] of Object.entries(campos)) {
          if (valor) corpo.replaceText(campo.replace(/\[/g, '\\[').replace(/\]/g, '\\]'), String(valor));
        }
        doc.saveAndClose();
      } catch (erro) {
        arquivo.setTrashed(true);
        throw erro;
      }
    }

    const corpo = DocumentApp.openById(arquivo.getId()).getBody();
    return {
      url: arquivo.getUrl(),
      pasta: pasta.getUrl(),
      pendencias: [...new Set(corpo.getText().match(/\[[^\]\n]+\]/g) || [])],
      status: 'Minuta em preparação',
    };
  } finally {
    lock.releaseLock();
  }
}

function buscarSolicitacao_(planilha, aba, linhaCabecalho, id) {
  const folha = planilha.getSheetByName(aba);
  if (!folha || folha.getLastRow() <= linhaCabecalho) {
    throw new Error('A aba ' + aba + ' não tem solicitações.');
  }
  const matriz = folha.getRange(linhaCabecalho, 1, folha.getLastRow() - linhaCabecalho + 1,
    folha.getLastColumn()).getDisplayValues();
  const cabecalho = matriz.shift();
  const coluna = cabecalho.indexOf('ID da solicitação');
  if (coluna < 0) throw new Error('A aba ' + aba + ' não tem coluna de ID da solicitação.');
  const resultados = matriz.filter(linha => linha[coluna].trim() === id);
  if (resultados.length !== 1) throw new Error('O ID deve aparecer uma vez na aba ' + aba + '.');
  return Object.fromEntries(cabecalho.map((campo, index) => [campo, resultados[0][index]]));
}

function nomeMesEmissao_(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    throw new Error('Informe a data de emissão no formato AAAA-MM-DD.');
  }
  const data = new Date(valor + 'T00:00:00Z');
  if (!Number.isFinite(data.getTime()) || data.toISOString().slice(0, 10) !== valor) {
    throw new Error('A data de emissão é inválida.');
  }
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return meses[data.getUTCMonth()] + valor.slice(2, 4);
}

function doGet(evento) {
  const pagina = HtmlService.createTemplateFromFile('Minuta');
  pagina.solicitacao = String(evento.parameter.solicitacao || '').trim();
  return pagina.evaluate().setTitle('Gerar minuta ENAP');
}
