import { Injectable } from "@angular/core";
import { Contratacao } from "../models/contratacao.model";
import { ContratoDocumento, TipoDocumento } from "../models/contrato-documento.model";
import { ContratoTemplateService } from "./contrato-template.service";

/**
 * Guarda o que foi editado no navegador. Os dados das contratações vêm de um
 * CSV importado a cada sessão, então o rascunho é validado por uma assinatura
 * (fornecedor + projeto) em vez de confiar só no id, que é reatribuído a cada
 * import.
 */
@Injectable({ providedIn: "root" })
export class ContratoRascunhoService {
  private readonly PREFIXO = "ih-contratos:doc:";

  constructor(private template: ContratoTemplateService) {}

  /** Rascunho salvo, se houver e ainda corresponder a esta contratação. */
  carregar(c: Contratacao, tipo: TipoDocumento): ContratoDocumento | null {
    try {
      const bruto = localStorage.getItem(this.chave(c.id, tipo));
      if (!bruto) return null;
      const doc = JSON.parse(bruto) as ContratoDocumento;
      if (doc.assinatura !== this.template.assinatura(c)) return null;
      if (!Array.isArray(doc.clausulas)) return null;
      return doc;
    } catch {
      return null;
    }
  }

  /** Rascunho salvo ou, na falta dele, o documento padrão do template. */
  obter(c: Contratacao, tipo: TipoDocumento): ContratoDocumento {
    return this.carregar(c, tipo) ?? this.template.criarDocumento(c, tipo);
  }

  salvar(doc: ContratoDocumento): void {
    doc.atualizadoEm = new Date().toISOString();
    try {
      localStorage.setItem(this.chave(doc.contratacaoId, doc.tipo), JSON.stringify(doc));
    } catch {
      // Sem espaço ou storage bloqueado: o documento segue válido em memória.
    }
  }

  descartar(contratacaoId: number, tipo: TipoDocumento): void {
    localStorage.removeItem(this.chave(contratacaoId, tipo));
  }

  private chave(id: number, tipo: TipoDocumento): string {
    return `${this.PREFIXO}${tipo}:${id}`;
  }
}
