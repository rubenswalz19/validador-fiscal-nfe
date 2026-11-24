const SUPABASE_URL = 'COLE_SUA_PROJECT_URL_AQUI';
const SUPABASE_KEY = 'COLE_SUA_CHAVE_ANON_PUBLIC_AQUI';
const STORAGE_KEY = 'nfe-auditoria-notas';
const SUPABASE_CONFIGURADO =
  SUPABASE_URL.startsWith('https://') && !SUPABASE_KEY.includes('COLE_SUA');

const headersSupabase = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

let notas = [];
const tabela = document.getElementById('tabelaNotas');
const feedback = document.getElementById('feedback');
const feedbackText = document.getElementById('feedbackText');
const botaoSimular = document.getElementById('btnSimular');
const xmlInput = document.getElementById('xmlInput');
const fileName = document.getElementById('fileName');
const dropzone = document.getElementById('dropzone');

function definirFeedback(mensagem, tipo = 'normal') {
  feedbackText.textContent = mensagem;
  feedback.className = `feedback${tipo === 'normal' ? '' : ` is-${tipo}`}`;
}

function carregarNotasLocais() {
  try {
    const salvo = JSON.parse(localStorage.getItem(STORAGE_KEY));
    notas = Array.isArray(salvo) ? salvo : [];
  } catch {
    notas = [];
  }
}

function salvarNotasLocais() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notas));
}

// 1. Carrega notas salvas no banco ao abrir a página
async function carregarNotasDoBanco() {
  carregarNotasLocais();
  atualizarTela();

  if (!SUPABASE_CONFIGURADO) {
    definirFeedback('Modo local ativo. Configure o Supabase para sincronizar.', 'normal');
    return;
  }

  definirFeedback('Sincronizando notas com o banco de dados...', 'working');
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/notas_fiscais?select=*&order=id.desc`, {
      headers: headersSupabase
    });
    if (res.ok) {
      notas = await res.json();
      salvarNotasLocais();
      atualizarTela();
      definirFeedback('Banco de dados conectado.', 'success');
    } else {
      definirFeedback('Banco indisponivel; usando dados locais.', 'error');
    }
  } catch {
    definirFeedback('Sem conexao com o banco; usando dados locais.', 'error');
  }
}

// 2. Salva nova nota auditada no PostgreSQL
async function salvarNotaNoBanco(novaNota) {
  notas.unshift(novaNota);
  salvarNotasLocais();

  if (!SUPABASE_CONFIGURADO) return;

  try {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/notas_fiscais`, {
    method: 'POST',
    headers: headersSupabase,
    body: JSON.stringify(novaNota)
  });
  if (res.ok) {
    const [salva] = await res.json();
    notas[0] = salva;
    salvarNotasLocais();
  }
  } catch {
    definirFeedback('Nota registrada localmente. Sincronizacao pendente.', 'error');
  }
}

// Consulta situação cadastral real do CNPJ via BrasilAPI
async function validarCNPJNaReceita(cnpjLimpo) {
  if (!/^\d{14}$/.test(cnpjLimpo)) {
    return { ativa: false, razao: 'CNPJ invalido' };
  }
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`);
    if (!res.ok) return { ativa: false, razao: 'CNPJ não encontrado' };
    const dados = await res.json();
    return {
      ativa: dados.descricao_situacao_cadastral === 'ATIVA',
      razao: dados.razao_social
    };
  } catch {
    return { ativa: false, razao: 'Erro na consulta API' };
  }
}

async function processarNota({ numero, cnpj, valorNota, somaItens }) {
  botaoSimular.disabled = true;
  xmlInput.disabled = true;
  definirFeedback('Consultando Receita Federal e registrando auditoria...', 'working');
  const cnpjLimpo = cnpj.replace(/\D/g, '');
  const consulta = await validarCNPJNaReceita(cnpjLimpo);

  const valoresBatem = Math.abs(valorNota - somaItens) < 0.01;
  const aprovada = consulta.ativa && valoresBatem;

  const registro = {
    numero,
    cnpj,
    razao: consulta.razao,
    valor: valorNota,
    status: aprovada ? 'Aprovada' : 'Divergente',
    motivo: !consulta.ativa ? 'CNPJ Irregular' : (!valoresBatem ? 'Divergência de Valores' : 'OK')
  };

  await salvarNotaNoBanco(registro);
  definirFeedback(
    `Nota #${numero} registrada (${registro.status}).`,
    registro.status === 'Aprovada' ? 'success' : 'error'
  );
  atualizarTela();
  botaoSimular.disabled = false;
  xmlInput.disabled = false;
}

function atualizarTela() {
  const filtro = document.getElementById('filtroStatus').value;
  const filtradas = filtro === 'TODOS' ? notas : notas.filter(n => n.status === filtro);

  tabela.innerHTML = filtradas.length ? filtradas.map(n => `
    <tr>
      <td><strong>#${escapeHtml(n.numero)}</strong></td>
      <td>${escapeHtml(formatarCNPJ(n.cnpj))}</td>
      <td>${escapeHtml(n.razao || 'Nao informado')}</td>
      <td>${Number(n.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
      <td><span class="pill ${n.status === 'Aprovada' ? 'pill-ok' : 'pill-err'}">${n.status} (${n.motivo})</span></td>
    </tr>
  `).join('') : `
    <tr class="empty-state">
      <td colspan="5">Nenhum documento encontrado para este filtro.</td>
    </tr>
  `;

  const total = notas.reduce((acc, n) => acc + Number(n.valor), 0);
  document.getElementById('kpi-total').textContent = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  document.getElementById('kpi-aprovadas').textContent = notas.filter(n => n.status === 'Aprovada').length;
  document.getElementById('kpi-divergentes').textContent = notas.filter(n => n.status === 'Divergente').length;
}

function escapeHtml(valor) {
  const div = document.createElement('div');
  div.textContent = String(valor);
  return div.innerHTML;
}

function formatarCNPJ(valor) {
  const cnpj = String(valor).replace(/\D/g, '');
  return cnpj.length === 14
    ? cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2}).*/, '$1.$2.$3/$4-$5')
    : String(valor);
}

// Leitura de arquivo XML real de NF-e
xmlInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  fileName.textContent = file.name;
  try {
    const text = await file.text();
    const xml = new DOMParser().parseFromString(text, 'text/xml');
    if (xml.querySelector('parsererror')) throw new Error('XML inválido');

    const numero = xml.querySelector('nNF')?.textContent || 'S/N';
    const cnpj = xml.querySelector('emit > CNPJ')?.textContent || '';
    const valorNota = parseFloat(xml.querySelector('ICMSTot > vNF')?.textContent || '0');
    const valorProdutos = parseFloat(xml.querySelector('ICMSTot > vProd')?.textContent || '0');

    if (!cnpj) throw new Error('CNPJ do emitente não encontrado');
    await processarNota({ numero, cnpj, valorNota, somaItens: valorProdutos });
  } catch (erro) {
    definirFeedback(erro.message || 'Não foi possível ler o arquivo XML.', 'error');
  }
});

// Botão de simulação
botaoSimular.addEventListener('click', () => {
  const exemplos = [
    { numero: '1042', cnpj: '00.000.000/0001-91', valorNota: 1500.00, somaItens: 1500.00 },
    { numero: '1043', cnpj: '33.000.167/0001-01', valorNota: 4200.00, somaItens: 3900.00 }
  ];
  const sorteado = exemplos[notas.length % exemplos.length];
  processarNota(sorteado);
});

document.getElementById('filtroStatus').addEventListener('change', atualizarTela);

['dragenter', 'dragover'].forEach(nome => {
  dropzone.addEventListener(nome, evento => {
    evento.preventDefault();
    dropzone.classList.add('is-dragging');
  });
});
['dragleave', 'drop'].forEach(nome => {
  dropzone.addEventListener(nome, evento => {
    evento.preventDefault();
    dropzone.classList.remove('is-dragging');
  });
});

// Inicializa carregando o histórico salvo
carregarNotasDoBanco();

