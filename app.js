const SUPABASE_URL = 'https://eghisnyhovokrwjinfbv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_GqA65T1Z_DSFDp6lVYyNWw_zFFRpTHK';
const SESSION_KEY = 'nfe-auditoria-session';
const SUPABASE_CONFIGURADO =
  SUPABASE_URL.startsWith('https://') && SUPABASE_KEY.startsWith('sb_publishable_');

let notas = [];
let session = null;
let criandoConta = false;

const tabela = document.getElementById('tabelaNotas');
const feedback = document.getElementById('feedback');
const feedbackText = document.getElementById('feedbackText');
const botaoSimular = document.getElementById('btnSimular');
const xmlInput = document.getElementById('xmlInput');
const fileName = document.getElementById('fileName');
const dropzone = document.getElementById('dropzone');
const authBox = document.getElementById('authBox');
const authForm = document.getElementById('authForm');
const authTitle = document.getElementById('authTitle');
const authSubmit = document.getElementById('authSubmit');
const authToggle = document.getElementById('authToggle');
const authFeedback = document.getElementById('authFeedback');
const appContent = document.getElementById('appContent');
const btnLogout = document.getElementById('btnLogout');

function definirFeedback(mensagem, tipo = 'normal') {
  feedbackText.textContent = mensagem;
  feedback.className = `feedback${tipo === 'normal' ? '' : ` is-${tipo}`}`;
}

function definirFeedbackAuth(mensagem, tipo = 'normal') {
  authFeedback.textContent = mensagem;
  authFeedback.className = `auth-feedback${tipo === 'normal' ? '' : ` is-${tipo}`}`;
}

async function supabaseRequest(path, { method = 'GET', body, accessToken, headers: customHeaders = {} } = {}) {
  const headers = { apikey: SUPABASE_KEY, ...customHeaders };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!response.ok) {
    const error = new Error(
      data?.msg || data?.message || data?.error_description || data?.error || 'Falha ao comunicar com o Supabase.'
    );
    error.status = response.status;
    throw error;
  }
  return data;
}

function guardarSessao(dados) {
  if (!dados?.access_token || !dados?.refresh_token || !dados?.user?.id) {
    throw new Error('O Supabase nao retornou uma sessao valida.');
  }
  session = {
    access_token: dados.access_token,
    refresh_token: dados.refresh_token,
    user: dados.user
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function limparSessao() {
  session = null;
  notas = [];
  localStorage.removeItem(SESSION_KEY);
}

function mostrarAplicacao() {
  authBox.hidden = true;
  appContent.hidden = false;
  btnLogout.hidden = false;
}

function mostrarLogin() {
  authBox.hidden = false;
  appContent.hidden = true;
  btnLogout.hidden = true;
}

function atualizarModoAuth() {
  authTitle.textContent = criandoConta ? 'Criar sua conta' : 'Entrar na sua conta';
  authSubmit.textContent = criandoConta ? 'Criar conta' : 'Entrar';
  authToggle.textContent = criandoConta
    ? 'Ja tem conta? Entrar'
    : 'Ainda nao tem conta? Criar conta';
  document.getElementById('authPassword').autocomplete = criandoConta ? 'new-password' : 'current-password';
}

async function renovarSessao() {
  const novosDados = await supabaseRequest('/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    body: { refresh_token: session.refresh_token }
  });
  guardarSessao(novosDados);
}

async function requisicaoAutenticada(path, options = {}) {
  try {
    return await supabaseRequest(path, { ...options, accessToken: session.access_token });
  } catch (error) {
    if (error.status !== 401 || !session?.refresh_token) throw error;
    await renovarSessao();
    return supabaseRequest(path, { ...options, accessToken: session.access_token });
  }
}

async function iniciarSessao(dados) {
  guardarSessao(dados);
  mostrarAplicacao();
  await carregarNotasDoBanco();
}

async function restaurarSessao() {
  if (!SUPABASE_CONFIGURADO) {
    mostrarLogin();
    authSubmit.disabled = true;
    authToggle.disabled = true;
    definirFeedbackAuth('A configuracao publica do Supabase esta incompleta.', 'error');
    return;
  }

  let salva;
  try {
    salva = JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    localStorage.removeItem(SESSION_KEY);
  }

  if (!salva?.access_token || !salva?.refresh_token) {
    mostrarLogin();
    return;
  }

  session = salva;
  try {
    const user = await requisicaoAutenticada('/auth/v1/user');
    session.user = user;
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    mostrarAplicacao();
    await carregarNotasDoBanco();
  } catch (error) {
    if (error.status === 401) {
      limparSessao();
      mostrarLogin();
      definirFeedbackAuth('Sua sessao expirou. Entre novamente.', 'error');
      return;
    }
    mostrarLogin();
    definirFeedbackAuth(`Nao foi possivel validar a sessao: ${error.message}`, 'error');
  }
}

async function carregarNotasDoBanco() {
  definirFeedback('Carregando suas notas...', 'working');
  try {
    notas = await requisicaoAutenticada('/rest/v1/notas_fiscais?select=*&order=id.desc');
    atualizarTela();
    definirFeedback('Notas sincronizadas com o Supabase.', 'success');
  } catch (error) {
    notas = [];
    atualizarTela();
    definirFeedback(`Nao foi possivel carregar as notas: ${error.message}`, 'error');
  }
}

async function salvarNotaNoBanco(novaNota) {
  const resultado = await requisicaoAutenticada('/rest/v1/notas_fiscais', {
    method: 'POST',
    body: { ...novaNota, user_id: session.user.id },
    headers: { Prefer: 'return=representation' }
  });
  if (!Array.isArray(resultado) || !resultado[0]) {
    throw new Error('O Supabase nao confirmou o salvamento da nota.');
  }
  notas.unshift(resultado[0]);
}

async function validarCNPJNaReceita(cnpjLimpo) {
  if (!/^\d{14}$/.test(cnpjLimpo)) {
    return { ativa: false, razao: 'CNPJ invalido' };
  }
  try {
    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`);
    if (!response.ok) return { ativa: false, razao: 'CNPJ nao encontrado' };
    const dados = await response.json();
    return {
      ativa: dados.descricao_situacao_cadastral === 'ATIVA',
      razao: dados.razao_social || 'Razao social nao informada'
    };
  } catch {
    return { ativa: false, razao: 'Falha na consulta de CNPJ' };
  }
}

async function processarNota({ numero, cnpj, valorNota, somaItens }) {
  botaoSimular.disabled = true;
  xmlInput.disabled = true;
  definirFeedback('Consultando CNPJ e registrando a auditoria...', 'working');

  try {
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
      motivo: !consulta.ativa ? 'CNPJ Irregular' : (!valoresBatem ? 'Divergencia de Valores' : 'OK')
    };

    await salvarNotaNoBanco(registro);
    definirFeedback(
      `Nota #${numero} salva no Supabase (${registro.status}).`,
      registro.status === 'Aprovada' ? 'success' : 'error'
    );
    atualizarTela();
  } catch (error) {
    definirFeedback(`Nao foi possivel salvar a nota: ${error.message}`, 'error');
  } finally {
    botaoSimular.disabled = false;
    xmlInput.disabled = false;
  }
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
      <td><span class="pill ${n.status === 'Aprovada' ? 'pill-ok' : 'pill-err'}">${escapeHtml(n.status)} (${escapeHtml(n.motivo)})</span></td>
    </tr>
  `).join('') : `
    <tr class="empty-state">
      <td colspan="5">Nenhum documento encontrado para este filtro.</td>
    </tr>
  `;

  const total = notas.reduce((acc, n) => acc + Number(n.valor), 0);
  document.getElementById('kpi-total').textContent =
    total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  document.getElementById('kpi-aprovadas').textContent =
    notas.filter(n => n.status === 'Aprovada').length;
  document.getElementById('kpi-divergentes').textContent =
    notas.filter(n => n.status === 'Divergente').length;
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

async function processarArquivoXML(file) {
  fileName.textContent = file.name;
  try {
    const text = await file.text();
    const xml = new DOMParser().parseFromString(text, 'text/xml');
    if (xml.querySelector('parsererror')) throw new Error('XML invalido.');

    const numero = xml.querySelector('nNF')?.textContent || 'S/N';
    const cnpj = xml.querySelector('emit > CNPJ')?.textContent || '';
    const valorNota = Number(xml.querySelector('ICMSTot > vNF')?.textContent || '0');
    const somaItens = Number(xml.querySelector('ICMSTot > vProd')?.textContent || '0');

    if (!cnpj) throw new Error('CNPJ do emitente nao encontrado.');
    if (!Number.isFinite(valorNota) || !Number.isFinite(somaItens)) {
      throw new Error('Os valores da nota fiscal sao invalidos.');
    }
    await processarNota({ numero, cnpj, valorNota, somaItens });
  } catch (error) {
    definirFeedback(error.message || 'Nao foi possivel ler o arquivo XML.', 'error');
  }
}

authForm.addEventListener('submit', async evento => {
  evento.preventDefault();
  authSubmit.disabled = true;
  definirFeedbackAuth(criandoConta ? 'Criando sua conta...' : 'Entrando...', 'working');
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;

  try {
    if (criandoConta) {
      const resultado = await supabaseRequest('/auth/v1/signup', {
        method: 'POST',
        body: { email, password }
      });
      if (resultado.access_token) {
        await iniciarSessao(resultado);
      } else {
        criandoConta = false;
        atualizarModoAuth();
        definirFeedbackAuth('Conta criada. Confirme o e-mail recebido e depois entre.', 'success');
      }
    } else {
      const resultado = await supabaseRequest('/auth/v1/token?grant_type=password', {
        method: 'POST',
        body: { email, password }
      });
      await iniciarSessao(resultado);
    }
  } catch (error) {
    definirFeedbackAuth(error.message, 'error');
  } finally {
    authSubmit.disabled = false;
  }
});

authToggle.addEventListener('click', () => {
  criandoConta = !criandoConta;
  atualizarModoAuth();
  definirFeedbackAuth('');
});

btnLogout.addEventListener('click', async () => {
  btnLogout.disabled = true;
  try {
    await requisicaoAutenticada('/auth/v1/logout', { method: 'POST' });
  } catch (error) {
    if (error.status !== 401) definirFeedback(`Falha ao encerrar sessao no servidor: ${error.message}`, 'error');
  } finally {
    limparSessao();
    mostrarLogin();
    definirFeedbackAuth('Sessao encerrada.', 'success');
    atualizarTela();
    btnLogout.disabled = false;
  }
});

xmlInput.addEventListener('change', async evento => {
  const file = evento.target.files[0];
  if (file) await processarArquivoXML(file);
});

botaoSimular.addEventListener('click', () => {
  const exemplos = [
    { numero: '1042', cnpj: '00.000.000/0001-91', valorNota: 1500, somaItens: 1500 },
    { numero: '1043', cnpj: '33.000.167/0001-01', valorNota: 4200, somaItens: 3900 }
  ];
  processarNota(exemplos[notas.length % exemplos.length]);
});

document.getElementById('filtroStatus').addEventListener('change', atualizarTela);

['dragenter', 'dragover'].forEach(nome => {
  dropzone.addEventListener(nome, evento => {
    evento.preventDefault();
    dropzone.classList.add('is-dragging');
  });
});
dropzone.addEventListener('dragleave', evento => {
  evento.preventDefault();
  dropzone.classList.remove('is-dragging');
});
dropzone.addEventListener('drop', async evento => {
  evento.preventDefault();
  dropzone.classList.remove('is-dragging');
  const file = evento.dataTransfer?.files[0];
  if (file) await processarArquivoXML(file);
});

atualizarModoAuth();
restaurarSessao();
