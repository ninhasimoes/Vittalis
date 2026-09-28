// ==========================================
// CONFIGURAÇÕES E ESTADO
// ==========================================
// A maior parte dos dados (metas, diário, perfil etc.) fica só no
// localStorage do navegador, sem back-end. A exceção é a recomendação
// por IA: ela chama o back-end em Python (pasta /backend), que por sua
// vez fala com o Gemini. Por isso essa URL existe: enquanto você testa
// no seu computador, "127.0.0.1" (o próprio computador) funciona, porque
// o back-end está rodando localmente. Mas isso só funciona PRA VOCÊ.
//
// Se você publicar o front-end como um link público para outras pessoas
// acessarem, o navegador de cada uma delas vai tentar chamar "127.0.0.1"
// DELAS, não o seu computador — e a recomendação por IA vai falhar pra
// todo mundo, mesmo com o back-end rodando no seu PC ligado 24h.
// Não existe jeito de contornar isso: um serviço num link público
// precisa de um back-end hospedado num servidor que qualquer pessoa
// consiga alcançar pela internet (ex.: Render, Railway, Fly.io), não no
// seu computador pessoal.
//
// Quando isso acontecer, troque a linha abaixo pela URL pública do seu
// back-end (algo como "https://vittalis-api.onrender.com") — é a ÚNICA
// mudança de código necessária para o app funcionar em outra máquina.
const API_BASE_URL = 'http://127.0.0.1:8000';

let usuarioPremiumAtivo = localStorage.getItem('vittalis_premium') === 'true';
let diaDiarioSelecionado = '';

// ==========================================
// HELPERS GERAIS (leitura segura de dados / escape de texto)
// ==========================================

// Faz JSON.parse sem derrubar a aplicação se o valor salvo estiver corrompido
// (ex.: alguém editou o localStorage manualmente e quebrou o JSON).
function parseJSONSeguro(texto) {
    try {
        return JSON.parse(texto);
    } catch (erro) {
        console.error('Dados salvos corrompidos, ignorando:', erro);
        return null;
    }
}

// Escapa texto do usuário antes de inserir via innerHTML, evitando que
// caracteres como < > " quebrem o layout ou injetem HTML indevido.
function escapeHTML(texto) {
    const div = document.createElement('div');
    div.textContent = texto ?? '';
    return div.innerHTML;
}

// Tenta salvar no localStorage e avisa (em vez de falhar em silêncio) se o
// navegador bloquear a gravação (ex.: modo privado/anônimo, quota cheia).
function salvarNoStorage(chave, valorObjeto) {
    try {
        localStorage.setItem(chave, JSON.stringify(valorObjeto));
        return true;
    } catch (erro) {
        console.error(`Não foi possível salvar "${chave}":`, erro);
        abrirModalGenerico('Não foi possível salvar', 'Seu navegador bloqueou o salvamento local (comum em modo anônimo/privado). Tente em uma aba normal.');
        return false;
    }
}
function assinarPremium() {
    localStorage.setItem('vittalis_usuario_premium', 'true');
    usuarioPremiumAtivo = true;
    
    // Adiciona o tema verde escuro
    document.body.classList.add('tema-premium');
    
    navegarPara('screen-diario'); // ou para onde desejar após assinar
}

// Hospedagens como a Netlify diferenciam maiúsculas de minúsculas nos nomes
// de arquivo (o Windows/Mac, usados no desenvolvimento, não diferenciam) —
// por isso, se a imagem esperada falhar, tentamos variações de nome antes
// de desistir e esconder o quadro de imagem quebrada.
function tratarErroImagemVittalis(imgElemento, candidatos, indice) {
    if (indice >= candidatos.length) {
        imgElemento.onerror = null;
        imgElemento.style.display = 'none';
        return;
    }
    imgElemento.onerror = () => tratarErroImagemVittalis(imgElemento, candidatos, indice + 1);
    imgElemento.src = candidatos[indice];
}

window.onload = function () {
    // Protótipo de demonstração: cada carregamento de página começa "zerado",
    // como se fosse a primeira visita de uma pessoa nova. Isso evita que dados
    // de um teste anterior (Índice Viva, metas, diário, plano Premium etc.)
    // apareçam para a próxima pessoa que testar o app no mesmo navegador.
    // Exceção: os campos do formulário "Sou Cliente Unimed" ficam salvos de
    // propósito, mesmo se a pessoa fechar e voltar sem terminar de preencher.
    const chavesParaManter = ['vittalis_draft_valCarteirinha', 'vittalis_draft_valNasc', 'vittalis_draft_valCpf'];
    Object.keys(localStorage)
        .filter(chave => chave.startsWith('vittalis_') && !chavesParaManter.includes(chave))
        .forEach(chave => localStorage.removeItem(chave));
    usuarioPremiumAtivo = false;

    carregarCamposValidacaoUnimed();

    carregarPerfil();
    gerarCalendarioSemana();
    gerarEvolucaoSemanal();
    aplicarTemaPremiumNasTelas();

    carregarMetasSalvas();
    carregarDiarioSalvo();
    carregarScoreAtualizado();
    carregarRecomendacaoIA();
    carregarDadosPessoais();
    verificarAvisoPersonalizacao();

    // Mantém a última mensagem de insight salva ao recarregar a página
    const savedInsight = localStorage.getItem('vittalis_last_insight');
    if (savedInsight && document.getElementById('dynamic-insight-text')) {
        document.getElementById('dynamic-insight-text').innerText = savedInsight;
    }
};

function verificarAvisoPersonalizacao() {
    const dados = parseJSONSeguro(localStorage.getItem('vittalis_dados_pessoais'));

    // Banner clicável (agora na tela de Metas): fica visível sempre que
    // faltar peso/altura, sem interromper a pessoa com um pop-up.
    const banner = document.getElementById('banner-completar-dados');
    if (banner) banner.style.display = (usuarioPremiumAtivo && (!dados || !dados.peso)) ? 'block' : 'none';
}

// ==========================================
// ACESSIBILIDADE POR TECLADO
// ==========================================
document.addEventListener('keydown', function (e) {
    // Esc fecha qualquer modal aberto
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal').forEach(modal => {
            if (modal.style.display === 'flex') modal.style.display = 'none';
        });
        return;
    }
    // Enter/Espaço ativam elementos clicáveis (divs com role="button")
    // do mesmo jeito que ativariam um <button> nativo
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"]')) {
        e.preventDefault();
        e.target.click();
    }
});

// ==========================================
// MENSAGEM DE INSIGHT DINÂMICA
// ==========================================
function atualizarInsight(acaoRealizada, pontosGanhos) {
    const mensagem = `Ótimo trabalho com "${acaoRealizada}"! Isso aumentou sua saúde em ${pontosGanhos} pontos.`;
    localStorage.setItem('vittalis_last_insight', mensagem);
    
    const insightText = document.getElementById('dynamic-insight-text');
    if (insightText) {
        insightText.innerText = mensagem;
    }
}

// ==========================================
// SISTEMA DE PERFIL DO USUÁRIO
// ==========================================
function carregarPerfil() {
    const perfil = parseJSONSeguro(localStorage.getItem('vittalis_perfil'));
    const elHome = document.getElementById('user-name-home');
    const elPremium = document.getElementById('user-name-premium');

    const primeiroNome = (perfil && perfil.nome) ? perfil.nome.trim().split(' ')[0] : '';
    const saudacao = primeiroNome ? `, ${primeiroNome}` : '';
    if (elHome) elHome.innerText = saudacao;
    if (elPremium) elPremium.innerText = saudacao;

    // Por escolha de design, os campos do formulário "Meu Perfil" começam
    // sempre em branco ao entrar na tela (não são pré-preenchidos com dados
    // salvos anteriormente), mesmo já existindo um perfil salvo.

    const linkCancelar = document.getElementById('link-cancelar-premium');
    if (linkCancelar) linkCancelar.style.display = usuarioPremiumAtivo ? 'block' : 'none';
}

// Permite voltar ao plano gratuito (útil tanto como funcionalidade real de
// cancelamento quanto para testar a experiência free de novo).
function cancelarAssinaturaPremium() {
    if (!confirm('Cancelar sua assinatura Premium e voltar ao plano gratuito?')) return;
    usuarioPremiumAtivo = false;
    localStorage.removeItem('vittalis_premium');
    aplicarTemaPremiumNasTelas();
    carregarPerfil();
    navegarPara('screen-home');
}

function salvarPerfil() {
    const form = document.getElementById('form-perfil');
    const dadosPerfil = Object.fromEntries(new FormData(form).entries());
    localStorage.setItem('vittalis_perfil', JSON.stringify(dadosPerfil));
    carregarPerfil(); 
    abrirModalGenerico('Sucesso', 'Seus dados foram atualizados com sucesso!');
    irParaHomeCorreta();
}

// ==========================================
// CALENDÁRIO DINÂMICO
// ==========================================
function gerarCalendarioSemana() {
    const container = document.getElementById('diary-week-selector');
    if (!container) return;

    const diasSemanaNomes = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const hoje = new Date();
    let diaDaSemana = hoje.getDay(); 
    let diferencaParaSegunda = diaDaSemana === 0 ? -6 : 1 - diaDaSemana; 
    let segundaFeira = new Date(hoje);
    segundaFeira.setDate(hoje.getDate() + diferencaParaSegunda);

    container.innerHTML = ''; 
    for (let i = 0; i < 7; i++) {
        let dataAtual = new Date(segundaFeira);
        dataAtual.setDate(segundaFeira.getDate() + i);
        let nomeDia = diasSemanaNomes[dataAtual.getDay()];
        let numDia = dataAtual.getDate().toString().padStart(2, '0');
        
        let ano = dataAtual.getFullYear();
        let mes = (dataAtual.getMonth() + 1).toString().padStart(2, '0');
        let chaveDia = `${ano}-${mes}-${numDia}`;
        let isHoje = (dataAtual.toDateString() === hoje.toDateString());
        let classeAtiva = isHoje ? 'active' : '';

        if (isHoje) diaDiarioSelecionado = chaveDia; 

        container.innerHTML += `<div class="day-col ${classeAtiva}" role="button" tabindex="0" aria-label="${nomeDia}, dia ${numDia}" onclick="selecionarDia(this, '${chaveDia}')"><span>${nomeDia}</span><strong>${numDia}</strong></div>`;
    }
}

// Card "Evolução semanal" da Home Premium: os checks seguem o calendário
// real da semana atual (segunda a domingo), marcando como concluído todo
// dia até hoje (inclusive).
function gerarEvolucaoSemanal() {
    const container = document.getElementById('evolution-week-container');
    const textoStreak = document.getElementById('evolution-streak-text');
    if (!container) return;

    const letrasDias = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']; // índice = getDay()
    const hoje = new Date();
    const diaDaSemana = hoje.getDay();
    const diferencaParaSegunda = diaDaSemana === 0 ? -6 : 1 - diaDaSemana;
    const segundaFeira = new Date(hoje);
    segundaFeira.setDate(hoje.getDate() + diferencaParaSegunda);

    let diasConcluidos = 0;
    container.innerHTML = '';
    for (let i = 0; i < 7; i++) {
        const dataAtual = new Date(segundaFeira);
        dataAtual.setDate(segundaFeira.getDate() + i);
        const letra = letrasDias[dataAtual.getDay()];
        const concluido = dataAtual <= hoje;
        if (concluido) diasConcluidos++;
        const classeCor = concluido ? 'text-green' : 'text-muted';
        const ehHoje = dataAtual.toDateString() === hoje.toDateString();
        container.innerHTML += `<div class="day-item"${ehHoje ? ' aria-current="date"' : ''}><span>${letra}</span><span class="material-symbols-rounded ${classeCor}" aria-hidden="true">check_circle</span></div>`;
    }

    if (textoStreak) {
        textoStreak.innerText = `${diasConcluidos} dia${diasConcluidos === 1 ? '' : 's'} consecutivo${diasConcluidos === 1 ? '' : 's'}`;
    }
}

// ==========================================
// RECOMENDAÇÃO DA IA (campo livre, preenchido manualmente)
// ==========================================
function salvarRecomendacaoIA(texto) {
    localStorage.setItem('vittalis_ai_recommendation', texto);
    atualizarPreviewRecomendacaoIA(texto);
}

function atualizarPreviewRecomendacaoIA(texto) {
    const preview = document.getElementById('previewRecomendacaoIA');
    if (preview) preview.innerText = texto;
}

function carregarRecomendacaoIA() {
    const texto = localStorage.getItem('vittalis_ai_recommendation');
    atualizarPreviewRecomendacaoIA(texto || 'Clique em Gerar para receber sua recomendação personalizada a partir dos seus dados de saúde.');
}

function expandirRecomendacaoIA() {
    const texto = localStorage.getItem('vittalis_ai_recommendation');
    if (!texto) return; // nada gerado ainda, não abre modal vazio
    abrirModalGenerico('Recomendação da IA', texto);
}

// ==========================================
// GRÁFICO DINÂMICO SVG
// ==========================================
function desenharGrafico(scoreAtual, filtroDias) {
    let scores = [];
    let datas = [];
    const hoje = new Date();
    let passo = filtroDias === 30 ? 7 : (filtroDias === 90 ? 21 : 1); 

    for(let i = 4; i >= 0; i--) {
        let d = new Date(hoje);
        d.setDate(hoje.getDate() - (i * passo));
        datas.push(`${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}`);
        let variacao = Math.floor(Math.random() * 20) - 10; 
        let simulado = scoreAtual - (i * (filtroDias === 7 ? 10 : 30)) + variacao;
        scores.push(Math.max(Math.min(simulado, 1000), 0));
    }
    
    scores[4] = scoreAtual; 
    const containerLabels = document.getElementById('chart-labels-container');
    if (containerLabels) {
        containerLabels.innerHTML = '';
        datas.forEach(d => containerLabels.innerHTML += `<span>${d}</span>`);
    }

    const polyline = document.getElementById('chart-polyline');
    const polygon = document.getElementById('chart-polygon');
    
    let minScore = Math.min(...scores) - 20;
    let maxScore = Math.max(...scores) + 20;
    if (minScore < 0) minScore = 0;
    if (maxScore > 1000) maxScore = 1000;
    let range = maxScore - minScore === 0 ? 1 : maxScore - minScore;

    let pointsStr = ""; let polygonPointsStr = "";
    const xCoords = [2, 26, 50, 74, 98]; 
    let ultimaAlturaY = 0;

    for (let i = 0; i < 5; i++) {
        let x = xCoords[i];
        let y = 100 - (((scores[i] - minScore) / range) * 100);
        pointsStr += `${x},${y} `;
        polygonPointsStr += `${x},${y} `;
        if (i === 4) ultimaAlturaY = y;
    }

    if (polyline) polyline.setAttribute('points', pointsStr.trim());
    if (polygon) {
        polygonPointsStr += `98,100 2,100`; 
        polygon.setAttribute('points', polygonPointsStr.trim());
    }

    const tooltip = document.getElementById('chart-current-score');
    if (tooltip) {
        tooltip.innerText = scoreAtual;
        tooltip.style.top = `calc(${ultimaAlturaY}% - 10px)`;
    }
}

// ==========================================
// MOTOR DE PONTUAÇÃO E FILTROS 
// ==========================================
function carregarScoreAtualizado() {
    let score = parseInt(localStorage.getItem('vittalis_score')) || 500;
    const elHome = document.getElementById('user-viva-score');
    if (elHome) elHome.innerText = score;
    desenharGrafico(score, 7);

    const btn7 = document.getElementById('btn-filter-7');
    const btn30 = document.getElementById('btn-filter-30');
    const btn90 = document.getElementById('btn-filter-90');
    if (btn7) btn7.setAttribute('onclick', `mudarFiltroEvolucao(this, 7)`);
    if (btn30) btn30.setAttribute('onclick', `mudarFiltroEvolucao(this, 30)`);
    if (btn90) btn90.setAttribute('onclick', `mudarFiltroEvolucao(this, 90)`);
}

function mudarFiltroEvolucao(btn, dias) {
    document.querySelectorAll('.filter-pills .pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    let score = parseInt(localStorage.getItem('vittalis_score')) || 500;
    desenharGrafico(score, dias);
}

function adicionarPontosScore(pontosGanhos) {
    let score = parseInt(localStorage.getItem('vittalis_score')) || 500;
    score += pontosGanhos;
    if (score > 1000) score = 1000; 
    localStorage.setItem('vittalis_score', score);
    carregarScoreAtualizado();
}


// ==========================================
// UX E NAVEGAÇÃO
// ==========================================
function navegarPara(screenId, clickedElement = null) {
    const screens = document.querySelectorAll('.screen');
    screens.forEach(s => { s.classList.remove('active'); s.classList.remove('fade-in'); });
    const novaTela = document.getElementById(screenId);
    novaTela.classList.add('active');
    setTimeout(() => novaTela.classList.add('fade-in'), 10);
    if (clickedElement) {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        clickedElement.classList.add('active');
    }
    document.querySelectorAll('.screen').forEach(area => area.scrollTop = 0);

    if (screenId === 'screen-validar-unimed') carregarCamposValidacaoUnimed();
}

function irParaHomeCorreta(element) {
    if (usuarioPremiumAtivo) navegarPara('screen-home-premium', element);
    else navegarPara('screen-home', element);
}

function entrarNoModoPremium() {
    usuarioPremiumAtivo = true;
    localStorage.setItem('vittalis_premium', 'true');
    aplicarTemaPremiumNasTelas();
    verificarAvisoPersonalizacao();
    navegarPara('screen-home-premium');
}

// Diário e Metas ganham o fundo verde (tema escuro) assim que a pessoa
// assina o Vittalis Premium; usuárias do plano gratuito continuam vendo
// essas telas no tema claro original.
function aplicarTemaPremiumNasTelas() {
    ['screen-diario', 'screen-metas'].forEach(id => {
        const tela = document.getElementById(id);
        if (tela) tela.classList.toggle('dark-theme', usuarioPremiumAtivo);
    });
}

// O ícone de medalha no menu inferior leva para a assinatura enquanto a
// pessoa é free; depois de assinar, passa a abrir o Índice Viva direto.
function abrirIndiceOuAssinatura(elemento) {
    navegarPara(usuarioPremiumAtivo ? 'screen-evolucao' : 'screen-assinatura', elemento);
}

function mudarAbaMetas(elemento, tipo) {
    document.querySelectorAll('.toggle-tabs .tab').forEach(t => t.classList.remove('active'));
    elemento.classList.add('active');
    carregarMetasSalvas();
}

function abrirModalGenerico(titulo, mensagem) {
    document.getElementById('modalTitulo').innerText = titulo;
    document.getElementById('modalMensagem').innerText = mensagem;
    document.getElementById('modalGenerico').style.display = 'flex';
}
function fecharModalGenerico() { document.getElementById('modalGenerico').style.display = 'none'; }
function abrirModalMeta() { renderizarMetasSugeridas(); document.getElementById('modalMeta').style.display = 'flex'; }
function fecharModalMeta() { document.getElementById('modalMeta').style.display = 'none'; }
function fecharModalAoClicarFora(event, idModal) {
    if (event.target.id === idModal) { document.getElementById(idModal).style.display = 'none'; }
}

function validarEConcluirUnimed() { entrarNoModoPremium(); navegarPara('screen-sucesso'); }
function concluirAssinaturaComSucesso() { entrarNoModoPremium(); navegarPara('screen-sucesso'); }

// ==========================================
// RECOMENDAÇÕES PERSONALIZADAS (dados opcionais + cálculos)
// ==========================================

// Faixa de mL por kg varia com a idade; adultos ficam em 35 mL/kg.
function calcularAguaPersonalizada(dados) {
    if (!dados || !dados.peso) return null;
    let mlPorKg = 35;
    if (dados.idade && dados.idade <= 17) mlPorKg = 40;
    else if (dados.idade && dados.idade >= 60) mlPorKg = 27.5;
    return Math.round(((dados.peso * mlPorKg) / 1000) * 10) / 10;
}

// TMB pela fórmula de Mifflin-St Jeor + fator de atividade = gasto calórico estimado (TDEE).
function calcularTMBeTDEE(dados) {
    if (!dados || !dados.peso || !dados.altura || !dados.idade || !dados.sexo) return null;
    const base = 10 * dados.peso + 6.25 * dados.altura - 5 * dados.idade;
    const tmb = dados.sexo === 'masculino' ? base + 5 : base - 161;
    const multiplicadores = { sedentario: 1.2, moderado: 1.55, intenso: 1.725 };
    const tdee = tmb * (multiplicadores[dados.atividade] || 1.375);
    return { tmb: Math.round(tmb), tdee: Math.round(tdee) };
}

function exibirResultadoCalculo(dados) {
    const caixa = document.getElementById('resultado-calculo-pessoal');
    if (!caixa) return;
    const textoAgua = document.getElementById('texto-resultado-agua');
    const textoCalorico = document.getElementById('texto-resultado-calorico');
    const agua = calcularAguaPersonalizada(dados);
    const tmbTdee = calcularTMBeTDEE(dados);

    if (!agua && !tmbTdee) { caixa.style.display = 'none'; return; }
    caixa.style.display = 'block';
    textoAgua.innerText = agua ? `💧 Meta de água sugerida: ${agua} litros por dia.` : '💧 Informe seu peso para calcular sua meta de água.';
    textoCalorico.innerText = tmbTdee ? `🍽️ Gasto calórico estimado: ~${tmbTdee.tdee} kcal por dia (referência para montar suas refeições).` : '🍽️ Informe peso, altura, idade e sexo para estimar seu gasto calórico.';
}

function salvarDadosPessoais() {
    const dados = {
        peso: parseFloat(document.getElementById('dpPeso').value) || null,
        altura: parseFloat(document.getElementById('dpAltura').value) || null,
        idade: parseInt(document.getElementById('dpIdade').value) || null,
        sexo: document.getElementById('dpSexo').value || null,
        atividade: document.getElementById('dpAtividade').value || 'moderado',
    };
    if (!salvarNoStorage('vittalis_dados_pessoais', dados)) return;

    exibirResultadoCalculo(dados);
    const metasCriadas = aplicarMetasPersonalizadasAutomaticas(dados);
    const banner = document.getElementById('banner-completar-dados');
    if (banner && dados.peso) banner.style.display = 'none';

    if (metasCriadas > 0) {
        abrirModalGenerico('Salvo!', 'Suas metas personalizadas já foram calculadas e adicionadas em "Minhas Metas".');
    } else if (dados.peso) {
        abrirModalGenerico('Salvo!', 'Dados salvos, mas não deu pra calcular metas ainda. Confira se o peso foi preenchido corretamente.');
    } else {
        abrirModalGenerico('Salvo!', 'Dados salvos. Preencha ao menos o peso para gerarmos sua meta de água personalizada automaticamente.');
    }
}

// Cria (ou atualiza, se já existir) metas na lista "Minhas Metas" com base nos
// dados pessoais informados — sem precisar abrir o modal "Criar nova meta".
// Cada meta calculada tem um "origem" único, então salvar os dados de novo
// (ex.: peso mudou) atualiza a mesma meta em vez de duplicar.
function aplicarMetasPersonalizadasAutomaticas(dados) {
    let metasGeradas = 0;

    const aguaPersonalizada = calcularAguaPersonalizada(dados);
    if (aguaPersonalizada) {
        upsertMetaPorOrigem('agua_personalizada', {
            titulo: `Beber ${aguaPersonalizada} litros de água hoje`,
            alvo: aguaPersonalizada, unidade: 'litros', cor: 'bg-blue', icon: 'water_drop',
        });
        metasGeradas++;
    }

    const tmbTdee = calcularTMBeTDEE(dados);
    if (tmbTdee) {
        upsertMetaPorOrigem('calorico_personalizado', {
            titulo: `Fazer 3 refeições equilibradas (~${tmbTdee.tdee} kcal/dia)`,
            alvo: 3, unidade: 'refeições', cor: 'bg-green', icon: 'restaurant',
        });
        metasGeradas++;
    }

    if (metasGeradas > 0) carregarMetasSalvas();
    return metasGeradas;
}

// Cria uma meta com esse "origem" se não existir ainda, ou atualiza os dados
// (título/alvo) de uma já existente — preservando o progresso atual dela.
function upsertMetaPorOrigem(origem, dadosMeta) {
    let metas = parseJSONSeguro(localStorage.getItem('vittalis_metas_temp')) || [];
    const existente = metas.find(m => m.origem === origem);
    if (existente) {
        Object.assign(existente, dadosMeta);
        existente.concluida = existente.atual >= existente.alvo;
    } else {
        metas.push({ id: Date.now() + Math.random(), atual: 0, concluida: false, origem, ...dadosMeta });
    }
    return salvarNoStorage('vittalis_metas_temp', metas);
}

function carregarDadosPessoais() {
    const dados = parseJSONSeguro(localStorage.getItem('vittalis_dados_pessoais'));
    if (!dados || !document.getElementById('dpPeso')) return;
    document.getElementById('dpPeso').value = dados.peso || '';
    document.getElementById('dpAltura').value = dados.altura || '';
    document.getElementById('dpIdade').value = dados.idade || '';
    document.getElementById('dpSexo').value = dados.sexo || '';
    document.getElementById('dpAtividade').value = dados.atividade || 'moderado';
    exibirResultadoCalculo(dados);
}

// ==========================================
// METAS SUGERIDAS (fixas, além da meta livre)
// ==========================================
const METAS_SUGERIDAS = [
    { titulo: 'Beber pelo menos 2 litros de água ao longo do dia', icon: 'water_drop', cor: 'bg-blue', unidade: 'litros', alvoBase: 2, tipo: 'agua' },
    { titulo: 'Fazer 30 minutos de caminhada ou exercício físico', icon: 'directions_run', cor: 'bg-green', unidade: 'minutos', alvoBase: 30 },
    { titulo: 'Comer uma porção de fruta ou salada nas principais refeições', icon: 'restaurant', cor: 'bg-green', unidade: 'refeições', alvoBase: 3 },
    { titulo: 'Dormir de 7 a 8 horas por noite com horários regulares', icon: 'bedtime', cor: 'bg-purple', unidade: 'horas', alvoBase: 7.5 },
    { titulo: 'Acordar e evitar o celular nos primeiros 30 minutos', icon: 'phonelink_off', cor: 'bg-purple', unidade: 'minutos', alvoBase: 30 },
];

function renderizarMetasSugeridas() {
    const container = document.getElementById('goal-suggestions-list');
    if (!container) return;
    const dadosPessoais = parseJSONSeguro(localStorage.getItem('vittalis_dados_pessoais'));
    const aguaPersonalizada = calcularAguaPersonalizada(dadosPessoais);

    container.innerHTML = '';
    METAS_SUGERIDAS.forEach((sugestao, indice) => {
        const personalizada = sugestao.tipo === 'agua' && aguaPersonalizada;
        const alvo = personalizada ? aguaPersonalizada : sugestao.alvoBase;
        const detalhe = personalizada
            ? `${alvo} ${sugestao.unidade} · calculado para o seu peso`
            : `${alvo} ${sugestao.unidade}`;

        const botao = document.createElement('button');
        botao.type = 'button';
        botao.className = 'goal-suggestion-chip';
        botao.setAttribute('aria-label', `Adicionar meta: ${sugestao.titulo}`);
        botao.innerHTML = `
            <div class="goal-icon ${sugestao.cor}"><span class="material-symbols-rounded" aria-hidden="true">${sugestao.icon}</span></div>
            <span class="goal-suggestion-text">${escapeHTML(sugestao.titulo)}<small>${escapeHTML(detalhe)}</small></span>
            <span class="material-symbols-rounded goal-suggestion-add" aria-hidden="true">add_circle</span>
        `;
        botao.addEventListener('click', () => adicionarMetaSugerida(indice));
        container.appendChild(botao);
    });
}

function adicionarMetaSugerida(indice) {
    const sugestao = METAS_SUGERIDAS[indice];
    if (!sugestao) return;
    const dadosPessoais = parseJSONSeguro(localStorage.getItem('vittalis_dados_pessoais'));
    const aguaPersonalizada = calcularAguaPersonalizada(dadosPessoais);
    const alvo = (sugestao.tipo === 'agua' && aguaPersonalizada) ? aguaPersonalizada : sugestao.alvoBase;
    const dadosDaMeta = { titulo: sugestao.titulo, alvo: alvo, unidade: sugestao.unidade, cor: sugestao.cor, icon: sugestao.icon };

    // A meta de água usa a mesma "origem" da meta calculada automaticamente
    // em Recomendações Personalizadas, então nunca duplica — só atualiza.
    let sucesso;
    if (sugestao.tipo === 'agua') {
        sucesso = upsertMetaPorOrigem('agua_personalizada', dadosDaMeta);
    } else {
        let metas = parseJSONSeguro(localStorage.getItem('vittalis_metas_temp')) || [];
        metas.push({ id: Date.now() + Math.floor(Math.random() * 1000), atual: 0, concluida: false, origem: 'sugerida', ...dadosDaMeta });
        sucesso = salvarNoStorage('vittalis_metas_temp', metas);
    }
    if (!sucesso) return;

    fecharModalMeta();
    carregarMetasSalvas();
}

// ==========================================
// METAS
// ==========================================
function carregarMetasSalvas() {
    const lista = document.getElementById('lista-metas');
    if (!lista) return;

    // A tela de Metas começa vazia: nenhuma meta de exemplo é criada
    // automaticamente. A pessoa só vê algo aqui depois de criar sua
    // própria meta em "+ Criar nova meta".
    const metasSalvas = parseJSONSeguro(localStorage.getItem('vittalis_metas_temp')) || [];
    
    const abaAtiva = document.querySelector('.toggle-tabs .tab.active');
    const tipoFiltro = abaAtiva ? abaAtiva.getAttribute('data-tab') : 'ativas';

    const metasFiltradas = metasSalvas.filter(m => {
        if (tipoFiltro === 'ativas') return m.concluida === false;
        if (tipoFiltro === 'concluidas') return m.concluida === true;
        return true;
    });

    lista.innerHTML = '';
    if (metasFiltradas.length === 0) {
        let mensagemVazia = tipoFiltro === 'ativas' ? "Você não tem nenhuma meta em andamento." : "Nenhuma meta concluída ainda. Vamos lá!";
        lista.innerHTML = `<p style="text-align: center; color: var(--text-muted); font-size: 14px; margin-top: 20px; padding: 20px;">${mensagemVazia}</p>`;
        return;
    }

    metasFiltradas.forEach((m) => {
        const li = document.createElement('li');
        li.className = `goal-item ${m.concluida ? 'concluida' : ''}`;
        // Guarda contra divisão por zero se a meta tiver alvo 0
        const porcentagem = (m.alvo > 0 ? Math.min((m.atual / m.alvo) * 100, 100) : 0) + '%';
        const tituloSeguro = escapeHTML(m.titulo);
        const unidadeSegura = escapeHTML(m.unidade);
        const progressoTexto = `<strong style="color: var(--text-strong);">${m.atual}</strong> de ${m.alvo} ${unidadeSegura}`;

        li.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                <div class="goal-main-clickable" role="button" tabindex="0" aria-label="Atualizar progresso: ${tituloSeguro}" onclick="abrirModalProgresso(${m.id})">
                    <div class="goal-icon ${m.cor}"><span class="material-symbols-rounded" aria-hidden="true">${m.concluida ? 'done' : m.icon}</span></div>
                    <div class="goal-info">
                        <span class="goal-title">${tituloSeguro}</span><span class="goal-value">${progressoTexto}</span>
                        <div class="progress-container-bg"><div class="progress-fill ${m.cor}" style="width: ${porcentagem};"></div></div>
                    </div>
                </div>
                <button type="button" class="edit-goal-btn" aria-label="Editar meta: ${tituloSeguro}" onclick="abrirModalEdicaoMeta(${m.id})"><span class="material-symbols-rounded" style="font-size: 20px;" aria-hidden="true">edit</span></button>
            </div>
        `;
        lista.appendChild(li);
    });
}

function adicionarMeta() {
    const titulo = document.getElementById('inputNomeMeta').value.trim();
    const alvo = parseFloat(document.getElementById('inputAlvoMeta').value);
    const unidade = document.getElementById('inputUnidadeMeta').value.trim();
    if (!titulo || isNaN(alvo) || alvo <= 0 || !unidade) {
        abrirModalGenerico('Ops', 'Preencha um objetivo, uma quantidade maior que zero e uma unidade válidos.');
        return;
    }

    let metas = parseJSONSeguro(localStorage.getItem('vittalis_metas_temp')) || [];
    metas.push({ id: Date.now(), titulo: titulo, atual: 0, alvo: alvo, unidade: unidade, cor: 'bg-green', icon: 'flag', concluida: false });
    if (!salvarNoStorage('vittalis_metas_temp', metas)) return;

    document.querySelectorAll('.toggle-tabs .tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.toggle-tabs .tab[data-tab="ativas"]').classList.add('active');

    carregarMetasSalvas();
    fecharModalMeta();
    document.getElementById('form-nova-meta').reset();
}

function abrirModalProgresso(idMeta) {
    let metas = parseJSONSeguro(localStorage.getItem('vittalis_metas_temp')) || [];
    const meta = metas.find(m => m.id === idMeta);
    if (!meta) return;

    document.getElementById('progresso-id-meta').value = meta.id;
    document.getElementById('progresso-nome-meta').value = meta.titulo;
    document.getElementById('progresso-titulo-meta').innerText = meta.titulo;
    document.getElementById('inputValorProgresso').value = meta.atual;
    document.getElementById('progresso-unidade').innerText = meta.unidade;
    document.getElementById('modalProgresso').style.display = 'flex';
}

function alterarProgressoMeta(quantidade) {
    const input = document.getElementById('inputValorProgresso');
    let valorAtual = parseFloat(input.value) || 0;
    const unidade = document.getElementById('progresso-unidade').innerText;
    let step = (unidade === 'horas' || unidade === 'h') ? 0.5 : 1;
    let novoValor = valorAtual + (quantidade * step);
    if (novoValor < 0) novoValor = 0; 
    input.value = novoValor;
}

function salvarProgressoMeta() {
    const idMeta = Number(document.getElementById('progresso-id-meta').value);
    const nomeMeta = document.getElementById('progresso-nome-meta').value;
    const novoValor = parseFloat(document.getElementById('inputValorProgresso').value);
    let metas = parseJSONSeguro(localStorage.getItem('vittalis_metas_temp')) || [];
    const index = metas.findIndex(m => m.id === idMeta);
    
    if (index > -1) {
        const estavaConcluida = metas[index].concluida;
        metas[index].atual = novoValor;
        metas[index].concluida = (novoValor >= metas[index].alvo); 

        if (!estavaConcluida && metas[index].concluida) {
            adicionarPontosScore(20); 
            // Atualiza apenas o Insight! (Lista de histórico foi removida)
            atualizarInsight(`Meta ${nomeMeta}`, 20);
        }
        localStorage.setItem('vittalis_metas_temp', JSON.stringify(metas));
    }
    
    document.getElementById('modalProgresso').style.display = 'none';
    carregarMetasSalvas();
}

function abrirModalEdicaoMeta(idMeta) {
    let metas = parseJSONSeguro(localStorage.getItem('vittalis_metas_temp')) || [];
    const meta = metas.find(m => m.id === idMeta);
    if (!meta) return;
    document.getElementById('editIdMeta').value = meta.id;
    document.getElementById('editNomeMeta').value = meta.titulo;
    document.getElementById('editAlvoMeta').value = meta.alvo;
    document.getElementById('editUnidadeMeta').value = meta.unidade;
    document.getElementById('modalEditarMeta').style.display = 'flex';
}

function salvarEdicaoMeta() {
    const idMeta = Number(document.getElementById('editIdMeta').value);
    const novoTitulo = document.getElementById('editNomeMeta').value.trim();
    const novoAlvo = parseFloat(document.getElementById('editAlvoMeta').value);
    const novaUnidade = document.getElementById('editUnidadeMeta').value.trim();

    if (!novoTitulo || isNaN(novoAlvo) || novoAlvo <= 0 || !novaUnidade) {
        abrirModalGenerico('Ops', 'Preencha um objetivo, uma quantidade maior que zero e uma unidade válidos.');
        return;
    }

    let metas = parseJSONSeguro(localStorage.getItem('vittalis_metas_temp')) || [];
    const index = metas.findIndex(m => m.id === idMeta);
    if (index > -1) {
        metas[index].titulo = novoTitulo;
        metas[index].alvo = novoAlvo;
        metas[index].unidade = novaUnidade;
        metas[index].concluida = (metas[index].atual >= novoAlvo);
        if (!salvarNoStorage('vittalis_metas_temp', metas)) return;
    }
    document.getElementById('modalEditarMeta').style.display = 'none';
    carregarMetasSalvas();
}

function excluirMeta() {
    const idMeta = Number(document.getElementById('editIdMeta').value);
    if (confirm("Tem certeza que deseja excluir esta meta?")) {
        let metas = parseJSONSeguro(localStorage.getItem('vittalis_metas_temp')) || [];
        metas = metas.filter(m => m.id !== idMeta);
        localStorage.setItem('vittalis_metas_temp', JSON.stringify(metas));
        document.getElementById('modalEditarMeta').style.display = 'none';
        carregarMetasSalvas();
    }
}


// ==========================================
// DIÁRIO
// ==========================================
function carregarDiarioSalvo() {
    const diarioData = parseJSONSeguro(localStorage.getItem('vittalis_diario_temp')) || {};
    const dadosHoje = diarioData[diaDiarioSelecionado] || { humor: 'normal', sono: 0, atividade: 0, agua: 0 };
    
    document.querySelectorAll('.mood-card').forEach(m => m.classList.remove('active'));
    const cardAtivo = document.querySelector(`.mood-card[data-humor="${dadosHoje.humor}"]`);
    if(cardAtivo) cardAtivo.classList.add('active');

    document.getElementById('metric-sono').innerText = formatarHoras(dadosHoje.sono);
    document.getElementById('metric-atividade').innerText = `${dadosHoje.atividade}min`;
    document.getElementById('metric-agua').innerText = `${dadosHoje.agua} copos`;
}

function formatarHoras(valorDecimal) {
    const horas = Math.floor(valorDecimal);
    const min = Math.round((valorDecimal - horas) * 60);
    if (min === 0) return `${horas}h`;
    return `${horas}h ${min}min`;
}

function selecionarDia(coluna, dataSelecionadaStr) { 
    document.querySelectorAll('.day-col').forEach(d => d.classList.remove('active')); 
    coluna.classList.add('active'); 
    diaDiarioSelecionado = dataSelecionadaStr; 
    carregarDiarioSalvo(); 
}

function selecionarHumor(card, humorStr) { 
    document.querySelectorAll('.mood-card').forEach(m => m.classList.remove('active')); 
    card.classList.add('active'); 
    
    const diarioData = parseJSONSeguro(localStorage.getItem('vittalis_diario_temp')) || {};
    if(!diarioData[diaDiarioSelecionado]) diarioData[diaDiarioSelecionado] = { humor: 'normal', sono: 0, atividade: 0, agua: 0 };
    
    diarioData[diaDiarioSelecionado].humor = humorStr;
    localStorage.setItem('vittalis_diario_temp', JSON.stringify(diarioData));
    
    adicionarPontosScore(2);
    // Atualiza Insight
    atualizarInsight('Humor Registrado', 2);
}

function abrirModalEdicaoDiario(tipo, titulo, unidade, icone) {
    const diarioData = parseJSONSeguro(localStorage.getItem('vittalis_diario_temp')) || {};
    const dadosHoje = diarioData[diaDiarioSelecionado] || { humor: 'normal', sono: 0, atividade: 0, agua: 0 };

    document.getElementById('diario-tipo-metrica').value = tipo;
    document.getElementById('diario-icone-metrica').value = icone;
    document.getElementById('diario-titulo-modal').innerText = titulo;
    document.getElementById('diario-unidade').innerText = unidade;
    document.getElementById('inputValorDiario').value = dadosHoje[tipo];

    document.getElementById('modalEdicaoDiario').style.display = 'flex';
}

function alterarValorDiario(quantidade) {
    const input = document.getElementById('inputValorDiario');
    let valorAtual = parseFloat(input.value) || 0;
    const tipo = document.getElementById('diario-tipo-metrica').value;
    
    let step = 1;
    if(tipo === 'sono') step = 0.5; 
    if(tipo === 'atividade') step = 5; 
    if(tipo === 'agua') step = 1; 
    
    let novoValor = valorAtual + (quantidade * step);
    if (novoValor < 0) novoValor = 0; 
    input.value = novoValor;
}

function salvarEdicaoDiario() {
    const tipo = document.getElementById('diario-tipo-metrica').value;
    const icone = document.getElementById('diario-icone-metrica').value || 'edit_note';
    const novoValor = parseFloat(document.getElementById('inputValorDiario').value);
    
    const diarioData = parseJSONSeguro(localStorage.getItem('vittalis_diario_temp')) || {};
    if(!diarioData[diaDiarioSelecionado]) diarioData[diaDiarioSelecionado] = { humor: 'normal', sono: 0, atividade: 0, agua: 0 };
    
    diarioData[diaDiarioSelecionado][tipo] = novoValor;
    localStorage.setItem('vittalis_diario_temp', JSON.stringify(diarioData));
    
    document.getElementById('modalEdicaoDiario').style.display = 'none';
    carregarDiarioSalvo();
    
    adicionarPontosScore(5);
    // Atualiza Insight
    atualizarInsight(`Diário: ${tipo}`, 5);
}

// ==========================================
// LÓGICA DO QUIZ 
// ==========================================
let etapaQuiz = 1;
let pontuacaoQuiz = 0; 

function iniciarQuiz() { 
    etapaQuiz = 1; 
    pontuacaoQuiz = 0;
    atualizarQuizUI(); 
    navegarPara('screen-quiz'); 
}

function proximaPerguntaQuiz() {
    const form = document.getElementById('form-quiz');
    const respostaSelecionada = new FormData(form).get('resposta_quiz');
    pontuacaoQuiz += parseInt(respostaSelecionada);
    etapaQuiz++;
    
    if (etapaQuiz > 3) { 
        localStorage.setItem('vittalis_score', pontuacaoQuiz);
        carregarScoreAtualizado(); 
        navegarPara('screen-resultado'); 
        animarScore(pontuacaoQuiz); 
    } else { 
        atualizarQuizUI(); 
    }
}

function atualizarQuizUI() {
    document.getElementById('quiz-step-indicator').innerText = `Pergunta ${etapaQuiz} de 3`;
    document.getElementById('quiz-count-label').innerText = `Progresso do módulo ${etapaQuiz}`;
    const titulo = document.getElementById('quiz-question-title');
    const opcoes = document.getElementById('quiz-options-container');

    if (etapaQuiz === 1) {
        titulo.innerText = "Como você avalia sua qualidade de sono?";
        opcoes.innerHTML = `
            <label class="quiz-option"><input type="radio" name="resposta_quiz" value="300" required checked> Muito boa</label>
            <label class="quiz-option"><input type="radio" name="resposta_quiz" value="200" required> Boa</label>
            <label class="quiz-option"><input type="radio" name="resposta_quiz" value="100" required> Regular</label>`;
    } 
    else if (etapaQuiz === 2) {
        titulo.innerText = "Com que frequência você pratica atividades físicas?";
        opcoes.innerHTML = `
            <label class="quiz-option"><input type="radio" name="resposta_quiz" value="350" required checked> Diariamente</label>
            <label class="quiz-option"><input type="radio" name="resposta_quiz" value="250" required> 3 a 4x na semana</label>
            <label class="quiz-option"><input type="radio" name="resposta_quiz" value="100" required> Raramente</label>`;
    } 
    else if (etapaQuiz === 3) {
        titulo.innerText = "Como você classifica seu nível de estresse diário?";
        opcoes.innerHTML = `
            <label class="quiz-option"><input type="radio" name="resposta_quiz" value="100" required> Alto</label>
            <label class="quiz-option"><input type="radio" name="resposta_quiz" value="250" required> Moderado</label>
            <label class="quiz-option"><input type="radio" name="resposta_quiz" value="350" required checked> Baixo</label>`;
    }
}

function animarScore(pontuacaoFinal) {
    const scoreElement = document.getElementById('partial-score');
    let atual = 0;
    const intervalo = setInterval(() => {
        atual += 25;
        if (atual >= pontuacaoFinal) { atual = pontuacaoFinal; clearInterval(intervalo); }
        scoreElement.innerText = atual;
    }, 30);
}

function salvarCampo(id) { localStorage.setItem('vittalis_draft_' + id, document.getElementById(id).value); }
function carregarCampoSalvo(id) {
    const salvo = localStorage.getItem('vittalis_draft_' + id);
    if (salvo && document.getElementById(id)) document.getElementById(id).value = salvo;
}

// Preenche o formulário "Sou Cliente Unimed" (carteirinha, nascimento, CPF).
// Prioridade: 1) o que a própria pessoa já digitou nesse formulário
// (rascunho salvo em vittalis_draft_*); 2) se ainda não tiver rascunho,
// os mesmos dados que ela já informou em "Meu Perfil", já que é a mesma
// pessoa e não faz sentido pedir de novo. Chamada tanto no carregamento
// da página quanto sempre que a pessoa navega para essa tela.
function carregarCamposValidacaoUnimed() {
    const perfil = parseJSONSeguro(localStorage.getItem('vittalis_perfil'));
    const campos = [
        { id: 'valCarteirinha', chavePerfil: 'carteirinha' },
        { id: 'valNasc', chavePerfil: 'data_nascimento' },
        { id: 'valCpf', chavePerfil: 'cpf' },
    ];
    campos.forEach(({ id, chavePerfil }) => {
        const input = document.getElementById(id);
        if (!input) return;
        const rascunho = localStorage.getItem('vittalis_draft_' + id);
        if (rascunho) {
            input.value = rascunho;
        } else if (perfil && perfil[chavePerfil]) {
            input.value = perfil[chavePerfil];
        }
    });
}

// ==========================================
// MÁSCARAS DE INPUT (RG E CPF)
// ==========================================
function mascaraCPF(input) {
    let v = input.value.replace(/\D/g, ""); // Remove tudo o que não é dígito
    if (v.length > 11) v = v.substring(0, 11); // Limita a 11 dígitos
    
    // Coloca os pontos e o traço
    v = v.replace(/(\d{3})(\d)/, "$1.$2");
    v = v.replace(/(\d{3})(\d)/, "$1.$2");
    v = v.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    
    input.value = v;
}

function mascaraRG(input) {
    // Remove o que não é dígito ou a letra X (maiúscula ou minúscula)
    let v = input.value.replace(/[^0-9Xx]/g, ""); 
    if (v.length > 9) v = v.substring(0, 9); // RG padrão SP tem 9 dígitos
    
    // Aplica a máscara: 00.000.000-0
    if (v.length > 2) v = v.substring(0,2) + "." + v.substring(2);
    if (v.length > 6) v = v.substring(0,6) + "." + v.substring(6);
    if (v.length > 10) v = v.substring(0,10) + "-" + v.substring(10);
    
    input.value = v;
}

async function gerarRecomendacaoIA() {
    const btn = document.getElementById('btn-gerar-ia');

    if (btn) btn.innerText = "Gerando...";
    atualizarPreviewRecomendacaoIA("Analisando seus dados de hoje...");

    // Coleta os dados do diário atual
    const diarioData = parseJSONSeguro(localStorage.getItem('vittalis_diario_temp')) || {};
    const dadosHoje = diarioData[diaDiarioSelecionado] || { humor: 'normal', sono: 0, atividade: 0, agua: 0 };

    try {
        const response = await fetch(`${API_BASE_URL}/api/insight`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dadosHoje)
        });
        
        if (!response.ok) throw new Error('Erro na resposta da API');
        
        const data = await response.json();

        // Formata a resposta recebida do Python (mensagem, risco e array de recomendações)
        if (data.mensagem) {
            const textoCompleto = `${data.mensagem}\n\nRisco geral: ${data.nivel_risco.toUpperCase()}\n\nRecomendações práticas:\n- ${data.recomendacoes.join('\n- ')}`;
            salvarRecomendacaoIA(textoCompleto);
        } else {
            salvarRecomendacaoIA("Não foi possível gerar a recomendação no momento.");
        }
    } catch (error) {
        console.error("Erro na integração com a IA:", error);
        salvarRecomendacaoIA("Erro de conexão com a IA. Verifique se o servidor Python está rodando na porta 8000.");
    } finally {
        if (btn) btn.innerText = "Gerar";
    }
}
function ativarPlanoBasico() {
    // Grava no sistema que a escolha é o Plano Básico, usando a MESMA chave
    // que o resto do app usa para checar o status Premium
    localStorage.removeItem('vittalis_premium');
    usuarioPremiumAtivo = false;

    // Atualiza o tema (fundo escuro/verde) de todas as telas que dependem do plano
    aplicarTemaPremiumNasTelas();

    navegarPara('screen-diario');
}