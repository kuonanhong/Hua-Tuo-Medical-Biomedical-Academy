/* Brain digital twin — regions (MNI mm, ellipsoids), conditions and drug/therapy pathways.
   Images: real MNI ICBM152 template with algorithmic pathology (see data/twins/brain/meta.json).
   Education only: mechanisms are simplified; no doses. */
window.HT_BRAIN_ATLAS = {
  format: 'huatuo-brain-atlas-v1',
  regions: {
    hippocampus: { zh: '海馬迴', en: 'Hippocampus', c: [26, -22, -14], r: [10, 20, 9], bilateral: true, group: 'limbic' },
    amygdala: { zh: '杏仁核', en: 'Amygdala', c: [23, -4, -18], r: [8, 8, 7], bilateral: true, group: 'limbic' },
    entorhinal: { zh: '內嗅皮質', en: 'Entorhinal cortex', c: [24, -8, -28], r: [8, 10, 6], bilateral: true, group: 'limbic' },
    caudate: { zh: '尾狀核', en: 'Caudate', c: [13, 10, 10], r: [7, 16, 9], bilateral: true, group: 'basal' },
    putamen: { zh: '殼核', en: 'Putamen', c: [25, 2, 2], r: [8, 14, 10], bilateral: true, group: 'basal' },
    pallidum: { zh: '蒼白球', en: 'Globus pallidus', c: [18, -2, -2], r: [6, 9, 7], bilateral: true, group: 'basal' },
    thalamus: { zh: '視丘', en: 'Thalamus', c: [11, -18, 8], r: [9, 13, 9], bilateral: true, group: 'basal' },
    stn: { zh: '視丘下核（STN）', en: 'Subthalamic nucleus (STN)', c: [11, -14, -6], r: [4, 4, 3], bilateral: true, group: 'basal' },
    sn: { zh: '黑質', en: 'Substantia nigra', c: [10, -18, -12], r: [5, 6, 5], bilateral: true, group: 'brainstem' },
    vta: { zh: '腹側被蓋區（VTA）', en: 'Ventral tegmental area', c: [0, -16, -14], r: [5, 4, 4], bilateral: false, group: 'brainstem' },
    accumbens: { zh: '依核', en: 'Nucleus accumbens', c: [9, 10, -8], r: [5, 5, 5], bilateral: true, group: 'basal' },
    basalForebrain: { zh: '基底前腦（Meynert 核）', en: 'Basal forebrain (nucleus basalis)', c: [14, 2, -10], r: [8, 6, 4], bilateral: true, group: 'basal' },
    raphe: { zh: '中縫核（血清素）', en: 'Raphe nuclei (serotonin)', c: [0, -28, -20], r: [4, 8, 12], bilateral: false, group: 'brainstem' },
    lc: { zh: '藍斑核（正腎上腺素）', en: 'Locus coeruleus (noradrenaline)', c: [5, -36, -24], r: [3, 4, 5], bilateral: true, group: 'brainstem' },
    motor: { zh: '初級運動皮質', en: 'Primary motor cortex', c: [36, -20, 56], r: [18, 10, 14], bilateral: true, group: 'cortex' },
    dlpfc: { zh: '背外側前額葉', en: 'Dorsolateral prefrontal cortex', c: [40, 36, 30], r: [16, 16, 14], bilateral: true, group: 'cortex' },
    ofc: { zh: '眶額皮質', en: 'Orbitofrontal cortex', c: [22, 40, -14], r: [18, 14, 8], bilateral: true, group: 'cortex' },
    acc: { zh: '前扣帶迴', en: 'Anterior cingulate', c: [4, 36, 18], r: [6, 16, 14], bilateral: true, group: 'cortex' },
    insula: { zh: '腦島', en: 'Insula', c: [38, 4, 2], r: [8, 18, 16], bilateral: true, group: 'cortex' },
    temporal: { zh: '外側顳葉', en: 'Lateral temporal lobe', c: [54, -16, -10], r: [12, 34, 18], bilateral: true, group: 'cortex' },
    parietal: { zh: '頂葉', en: 'Parietal lobe', c: [36, -56, 46], r: [20, 18, 16], bilateral: true, group: 'cortex' },
    occipital: { zh: '枕葉（視覺皮質）', en: 'Occipital (visual) cortex', c: [10, -88, 6], r: [16, 12, 16], bilateral: true, group: 'cortex' },
    frontal: { zh: '額葉', en: 'Frontal lobe', c: [30, 40, 26], r: [26, 30, 30], bilateral: true, group: 'cortex' },
    broca: { zh: '布洛卡區（語言表達）', en: "Broca's area", c: [-48, 18, 16], r: [10, 10, 10], bilateral: false, group: 'cortex' },
    wernicke: { zh: '韋尼克區（語言理解）', en: "Wernicke's area", c: [-54, -44, 14], r: [12, 12, 10], bilateral: false, group: 'cortex' },
    cerebellum: { zh: '小腦', en: 'Cerebellum', c: [24, -62, -36], r: [24, 24, 18], bilateral: true, group: 'brainstem' },
    brainstem: { zh: '腦幹', en: 'Brainstem', c: [0, -30, -30], r: [10, 12, 24], bilateral: false, group: 'brainstem' },
    ventricles: { zh: '側腦室', en: 'Lateral ventricles', c: [14, -10, 16], r: [10, 34, 14], bilateral: true, group: 'csf' },
    thirdVentricle: { zh: '第三腦室', en: 'Third ventricle', c: [0, -10, 4], r: [3, 14, 8], bilateral: false, group: 'csf' },
    choroid: { zh: '脈絡叢（產生腦脊髓液）', en: 'Choroid plexus (CSF production)', c: [18, -30, 12], r: [6, 12, 6], bilateral: true, group: 'csf' },
    mca: { zh: '中大腦動脈供血區', en: 'MCA territory', c: [44, -6, 18], r: [24, 48, 34], bilateral: true, group: 'vascular' },
    mcaM1: { zh: '中大腦動脈 M1 段', en: 'MCA M1 segment', c: [28, 2, -2], r: [10, 4, 4], bilateral: true, group: 'vascular' },
    aca: { zh: '前大腦動脈供血區', en: 'ACA territory', c: [8, 26, 48], r: [10, 40, 22], bilateral: true, group: 'vascular' },
    pca: { zh: '後大腦動脈供血區', en: 'PCA territory', c: [22, -72, 2], r: [22, 22, 20], bilateral: true, group: 'vascular' },
    pvwm: { zh: '腦室周圍白質', en: 'Periventricular white matter', c: [22, -14, 24], r: [10, 36, 12], bilateral: true, group: 'wm' },
    corpusCallosum: { zh: '胼胝體', en: 'Corpus callosum', c: [0, -8, 20], r: [6, 40, 6], bilateral: false, group: 'wm' },
    trigeminal: { zh: '三叉神經核／神經節', en: 'Trigeminal nucleus / ganglion', c: [16, -32, -36], r: [6, 8, 8], bilateral: true, group: 'brainstem' },
    meninges: { zh: '腦膜血管（硬腦膜）', en: 'Meningeal vessels (dura)', c: [0, -10, 70], r: [60, 70, 6], bilateral: false, group: 'vascular' },
    hypothalamus: { zh: '下視丘', en: 'Hypothalamus', c: [0, -4, -12], r: [6, 6, 5], bilateral: false, group: 'basal' },
    pituitary: { zh: '腦下垂體', en: 'Pituitary', c: [0, 2, -30], r: [6, 5, 5], bilateral: false, group: 'basal' },
    putamenR: { zh: '右側殼核', en: 'Right putamen', c: [24, 2, 6], r: [11, 20, 13], bilateral: false, group: 'basal' },
    tumour: { zh: '右額葉腫瘤', en: 'Right frontal tumour', c: [26, 28, 24], r: [16, 17, 16], bilateral: false, group: 'lesion' },
    tumourEdema: { zh: '瘤周水腫', en: 'Peritumoural oedema', c: [30, 22, 22], r: [30, 32, 28], bilateral: false, group: 'lesion' },
    infarctL: { zh: '左側 MCA 梗塞區', en: 'Left MCA infarct', c: [-44, -6, 18], r: [24, 48, 34], bilateral: false, group: 'lesion' },
    hippocampusL: { zh: '左海馬迴（硬化）', en: 'Left hippocampus (sclerosis)', c: [-24, -24, -14], r: [8, 14, 7], bilateral: false, group: 'lesion' },
    peritoneum: { zh: '腹腔（分流管終點）', en: 'Peritoneal cavity (shunt end)', c: [0, -120, -70], r: [1, 1, 1], bilateral: false, group: 'external' }
  },
  pathways: {
    nigrostriatal: { zh: '黑質紋狀體多巴胺路徑', en: 'Nigrostriatal dopamine pathway', via: ['sn', 'putamen', 'caudate'] },
    mesolimbic: { zh: '中腦邊緣多巴胺路徑', en: 'Mesolimbic dopamine pathway', via: ['vta', 'accumbens', 'dlpfc'] },
    cholinergic: { zh: '基底前腦膽鹼路徑', en: 'Basal-forebrain cholinergic projections', via: ['basalForebrain', 'hippocampus', 'frontal', 'parietal'] },
    serotonergic: { zh: '中縫核血清素路徑', en: 'Raphe serotonergic projections', via: ['raphe', 'amygdala', 'hippocampus', 'dlpfc'] },
    noradrenergic: { zh: '藍斑核正腎上腺素路徑', en: 'Locus coeruleus noradrenergic projections', via: ['lc', 'thalamus', 'frontal'] },
    trigeminovascular: { zh: '三叉神經血管系統', en: 'Trigeminovascular system', via: ['meninges', 'trigeminal', 'thalamus', 'insula'] },
    csf: { zh: '腦脊髓液循環', en: 'CSF circulation', via: ['choroid', 'ventricles', 'thirdVentricle', 'brainstem'] },
    corticospinal: { zh: '皮質脊髓徑', en: 'Corticospinal tract', via: ['motor', 'thalamus', 'brainstem'] },
    language: { zh: '語言網絡', en: 'Language network', via: ['wernicke', 'broca'] },
    mcaFlow: { zh: '中大腦動脈血流', en: 'MCA blood flow', via: ['mcaM1', 'mca'] }
  },
  conditions: [
    { id: 'normal', images: 'normal', zh: '正常腦部（解剖導覽）', en: 'Normal brain (anatomy tour)', modality: 'T1', dept: 'neurology',
      summary: '真實 MNI ICBM152 平均腦（152 位成人 MRI 平均）。先認識皮質、深部核、邊緣系統、腦幹與腦室的位置，再看各疾病如何改變它們。', summaryEn: 'The real MNI ICBM152 average brain (152 adult MRIs). Learn where cortex, deep nuclei, limbic structures, brainstem and ventricles sit before seeing how disease changes them.',
      findings: [], highlight: [{ roi: 'hippocampus', kind: 'label' }, { roi: 'caudate', kind: 'label' }, { roi: 'putamen', kind: 'label' }, { roi: 'thalamus', kind: 'label' }, { roi: 'motor', kind: 'label' }, { roi: 'broca', kind: 'label' }, { roi: 'wernicke', kind: 'label' }, { roi: 'cerebellum', kind: 'label' }, { roi: 'brainstem', kind: 'label' }, { roi: 'ventricles', kind: 'label' }, { roi: 'occipital', kind: 'label' }, { roi: 'dlpfc', kind: 'label' }],
      therapies: [
        { id: 'tour-motor', zh: '運動系統', en: 'Motor system', kind: 'anatomy', targets: ['motor', 'putamen', 'thalamus', 'cerebellum'], pathway: 'corticospinal', text: '運動指令由初級運動皮質經內囊、腦幹下行至脊髓；基底核與小腦負責選擇、啟動與協調。', textEn: 'Commands leave the primary motor cortex through the internal capsule and brainstem to the spinal cord; the basal ganglia select and initiate movement, the cerebellum coordinates it.' },
        { id: 'tour-language', zh: '語言網絡', en: 'Language network', kind: 'anatomy', targets: ['broca', 'wernicke'], pathway: 'language', text: '左側韋尼克區理解、布洛卡區表達，兩者由弓狀束連接；左 MCA 中風常同時影響。', textEn: 'Left Wernicke (comprehension) and Broca (production) connected by the arcuate fasciculus; a left MCA stroke commonly hits both.' },
        { id: 'tour-memory', zh: '記憶與情緒', en: 'Memory & emotion', kind: 'anatomy', targets: ['hippocampus', 'amygdala', 'entorhinal'], pathway: 'cholinergic', text: '海馬迴登錄新記憶、杏仁核賦予情緒意義；內嗅皮質是最早受阿茲海默病理影響的入口。', textEn: 'The hippocampus encodes new memories and the amygdala gives them emotional weight; the entorhinal cortex is the first gateway hit by Alzheimer pathology.' },
        { id: 'tour-vascular', zh: '血管供應區', en: 'Vascular territories', kind: 'anatomy', targets: ['mca', 'aca', 'pca'], pathway: 'mcaFlow', text: '中大腦動脈供應外側半球與基底核，前大腦供應內側額頂葉，後大腦供應枕葉與內側顳葉。', textEn: 'MCA supplies the lateral hemisphere and basal ganglia, ACA the medial frontoparietal cortex, PCA the occipital and medial temporal lobes.' }
      ] },
    { id: 'parkinson', images: 'parkinson', zh: '巴金森病', en: "Parkinson's disease", modality: 'T1', dept: 'neurology',
      summary: '傳統 MRI 幾乎正常——診斷靠臨床。病理在黑質緻密部多巴胺神經元退化，紋狀體（殼核、尾狀核）多巴胺不足，導致動作遲緩、僵硬、靜止性顫抖。', summaryEn: 'Conventional MRI is nearly normal — the diagnosis is clinical. Dopaminergic neurons of the substantia nigra pars compacta degenerate, so the striatum (putamen, caudate) is starved of dopamine: bradykinesia, rigidity, resting tremor.',
      findings: ['MRI 主要用來排除其他原因（血管、水腦、腫瘤）', '黑質在高解析度神經黑色素影像可見訊號減少（本圖以疊加標示）', '紋狀體結構正常但功能缺損（DAT-SPECT 可見攝取減少）'], findingsEn: ['MRI mainly excludes other causes (vascular, hydrocephalus, tumour)', 'Substantia nigra signal loss is visible on neuromelanin imaging (shown here as an overlay)', 'Striatum is structurally normal but functionally deficient (reduced DAT-SPECT uptake)'],
      highlight: [{ roi: 'sn', kind: 'lesion' }, { roi: 'putamen', kind: 'atrophy' }, { roi: 'caudate', kind: 'label' }],
      therapies: [
        { id: 'levodopa', zh: '左旋多巴／卡比多巴', en: 'Levodopa / carbidopa', kind: 'drug', targets: ['putamen', 'caudate'], pathway: 'nigrostriatal', text: '左旋多巴通過血腦障壁，在殘存的黑質紋狀體神經末梢轉成多巴胺，補足殼核與尾狀核的多巴胺；卡比多巴阻止周邊轉換減少噁心。疾病晚期末梢更少，藥效波動（wearing-off）與異動症出現。', textEn: 'Levodopa crosses the blood–brain barrier and is converted to dopamine in surviving nigrostriatal terminals, replenishing putamen and caudate; carbidopa blocks peripheral conversion. As terminals dwindle, wearing-off and dyskinesia appear.', caution: '不可與非選擇性 MAOI 併用；多巴胺拮抗劑（metoclopramide、haloperidol）會抵消藥效。', cautionEn: 'Never with non-selective MAOIs; dopamine antagonists (metoclopramide, haloperidol) cancel the effect.' },
        { id: 'agonist', zh: '多巴胺受體促效劑（pramipexole、ropinirole）', en: 'Dopamine agonists (pramipexole, ropinirole)', kind: 'drug', targets: ['putamen', 'caudate', 'accumbens'], pathway: 'mesolimbic', text: '直接刺激紋狀體 D2/D3 受體，不需黑質末梢；但同時作用於中腦邊緣路徑（依核）可能引發衝動控制障礙、嗜睡、幻覺。', textEn: 'Stimulate striatal D2/D3 receptors directly without needing nigral terminals; action on the mesolimbic pathway (accumbens) can cause impulse-control disorders, somnolence, hallucinations.' },
        { id: 'maob', zh: 'MAO-B 抑制劑（rasagiline、selegiline）', en: 'MAO-B inhibitors (rasagiline, selegiline)', kind: 'drug', targets: ['putamen', 'caudate'], pathway: 'nigrostriatal', text: '抑制紋狀體內多巴胺分解，延長殘存多巴胺作用；早期單獨使用或晚期減少 off 時間。', textEn: 'Block dopamine breakdown in the striatum, prolonging what dopamine remains; used alone early or to reduce off-time later.' },
        { id: 'dbs', zh: '深部腦刺激（STN／GPi）', en: 'Deep brain stimulation (STN / GPi)', kind: 'procedure', targets: ['stn', 'pallidum'], pathway: null, text: '高頻電刺激視丘下核或蒼白球內段，抑制過度活化的間接路徑輸出，改善動作波動與顫抖；需立體定位植入電極（見神經外科程序庫）。', textEn: 'High-frequency stimulation of STN or GPi suppresses the overactive indirect-pathway output, improving fluctuations and tremor; requires stereotactic lead implantation (see the neurosurgery library).' },
        { id: 'anticholinergic', zh: '抗膽鹼劑（trihexyphenidyl）', en: 'Anticholinergics (trihexyphenidyl)', kind: 'drug', targets: ['putamen'], pathway: null, text: '降低紋狀體膽鹼活性以平衡多巴胺不足，對顫抖較有效；高齡者易致譫妄、尿滯留，少用。', textEn: 'Reduce striatal cholinergic activity to rebalance dopamine deficiency; helps tremor but causes delirium and retention in older adults — rarely used.' }
      ] },
    { id: 'alzheimer', images: 'alzheimer', zh: '阿茲海默症', en: "Alzheimer's disease", modality: 'T1', dept: 'neurology',
      summary: '影像上先看到內側顳葉（海馬迴、內嗅皮質）萎縮，顳葉角擴大，之後頂顳葉皮質溝回變寬、腦室整體擴大；額葉相對保留到較晚。', summaryEn: 'Medial temporal atrophy (hippocampus, entorhinal cortex) with widening temporal horns comes first, then temporoparietal sulcal widening and global ventricular enlargement; frontal lobes are spared until late.',
      findings: ['海馬迴體積減少（冠狀切面最清楚，比較正常影像）', '顳葉角擴大、腦室擴大', '頂顳葉腦溝變寬；額葉相對保留'], findingsEn: ['Hippocampal volume loss (clearest on coronal slices — compare with normal)', 'Temporal-horn and ventricular enlargement', 'Temporoparietal sulcal widening; frontal lobes relatively spared'],
      highlight: [{ roi: 'hippocampus', kind: 'atrophy' }, { roi: 'entorhinal', kind: 'atrophy' }, { roi: 'parietal', kind: 'atrophy' }, { roi: 'ventricles', kind: 'label' }],
      therapies: [
        { id: 'donepezil', zh: '膽鹼酯酶抑制劑（donepezil、rivastigmine、galantamine）', en: 'Cholinesterase inhibitors (donepezil, rivastigmine, galantamine)', kind: 'drug', targets: ['hippocampus', 'frontal', 'parietal'], pathway: 'cholinergic', text: '基底前腦 Meynert 核的膽鹼神經元退化，投射到海馬迴與皮質的乙醯膽鹼減少；抑制膽鹼酯酶讓突觸乙醯膽鹼停留更久，暫時改善注意與記憶，不改變病程。', textEn: 'Cholinergic neurons of the nucleus basalis degenerate, starving hippocampus and cortex of acetylcholine; blocking cholinesterase keeps synaptic acetylcholine longer — modest symptomatic benefit, no change in course.', caution: '心搏過緩、暈厥、腸胃副作用；與 β 阻斷劑併用注意。', cautionEn: 'Bradycardia, syncope, GI effects; care with beta-blockers.' },
        { id: 'memantine', zh: 'Memantine（NMDA 拮抗劑）', en: 'Memantine (NMDA antagonist)', kind: 'drug', targets: ['hippocampus', 'parietal', 'frontal'], pathway: null, text: '減少過度麩胺酸刺激造成的神經毒性，用於中重度；常與膽鹼酯酶抑制劑合用。', textEn: 'Dampens excitotoxic glutamate signalling; for moderate-severe disease, often combined with a cholinesterase inhibitor.' },
        { id: 'lecanemab', zh: '抗類澱粉抗體（lecanemab、donanemab）', en: 'Anti-amyloid antibodies (lecanemab, donanemab)', kind: 'drug', targets: ['frontal', 'parietal', 'temporal'], pathway: null, text: '清除皮質類澱粉斑，早期患者延緩退化；需 MRI 監測 ARIA（血管性水腫／微出血），APOE ε4 帶因者風險較高。', textEn: 'Clear cortical amyloid plaques and slow decline in early disease; MRI surveillance for ARIA (oedema / microhaemorrhage), higher risk in APOE ε4 carriers.' }
      ] },
    { id: 'ftd', images: 'ftd', zh: '額顳葉失智症', en: 'Frontotemporal dementia', modality: 'T1', dept: 'neurology',
      summary: '額葉與前顳葉「刀刃狀」萎縮，後方相對保留；行為變異型以人格改變、去抑制、冷漠為主，記憶早期反而尚可。', summaryEn: 'Knife-edge atrophy of frontal and anterior temporal lobes with posterior sparing; the behavioural variant presents with personality change, disinhibition and apathy while memory is initially preserved.',
      findings: ['額葉腦溝明顯變寬（與阿茲海默的頂顳葉型態不同）', '前顳極萎縮，常不對稱', '額角擴大'], findingsEn: ['Marked frontal sulcal widening (unlike the temporoparietal pattern of Alzheimer)', 'Anterior temporal pole atrophy, often asymmetric', 'Frontal-horn enlargement'],
      highlight: [{ roi: 'frontal', kind: 'atrophy' }, { roi: 'ofc', kind: 'atrophy' }, { roi: 'temporal', kind: 'atrophy' }],
      therapies: [
        { id: 'ssri-ftd', zh: 'SSRI（行為症狀）', en: 'SSRIs (behavioural symptoms)', kind: 'drug', targets: ['ofc', 'acc', 'amygdala'], pathway: 'serotonergic', text: '眶額—邊緣血清素調節減弱；SSRI 可改善去抑制、強迫行為與食慾改變。沒有疾病修飾治療。', textEn: 'Orbitofrontal–limbic serotonergic modulation is lost; SSRIs can ease disinhibition, compulsions and appetite change. No disease-modifying therapy exists.' },
        { id: 'avoid-chei', zh: '避免膽鹼酯酶抑制劑', en: 'Avoid cholinesterase inhibitors', kind: 'caution', targets: ['basalForebrain'], pathway: null, text: '額顳葉失智的膽鹼系統大致完整，膽鹼酯酶抑制劑無效甚至加重躁動。', textEn: 'The cholinergic system is largely intact in FTD; cholinesterase inhibitors do not help and may worsen agitation.' }
      ] },
    { id: 'stroke-mca', images: 'stroke-mca', zh: '急性缺血性中風（左側 MCA）', en: 'Acute ischaemic stroke (left MCA)', modality: 'CT-like', dept: 'neurology',
      summary: '左中大腦動脈阻塞：右側偏癱、失語。早期 CT 可見灰白質分界消失、腦溝消失、低密度區；本圖由真實 MRI 模板轉為 CT 樣式並疊加梗塞區。', summaryEn: 'Left MCA occlusion: right hemiparesis and aphasia. Early CT shows loss of grey-white differentiation, sulcal effacement and hypodensity; this view is the real MRI template rendered CT-like with the infarct territory applied.',
      findings: ['左外側半球低密度、灰白質分界消失', '腦溝消失（細胞毒性水腫）', '可能見到「高密度 MCA 徵」（血栓）', 'ASPECTS 評分逐區扣分'], findingsEn: ['Hypodensity and loss of grey-white differentiation in the left lateral hemisphere', 'Sulcal effacement (cytotoxic oedema)', 'A hyperdense MCA sign may show the thrombus', 'ASPECTS scored region by region'],
      highlight: [{ roi: 'infarctL', kind: 'lesion' }, { roi: 'broca', kind: 'label' }, { roi: 'wernicke', kind: 'label' }, { roi: 'motor', kind: 'label' }],
      therapies: [
        { id: 'tpa', zh: '靜脈溶栓（alteplase／tenecteplase）', en: 'IV thrombolysis (alteplase / tenecteplase)', kind: 'drug', targets: ['mcaM1', 'mca'], pathway: 'mcaFlow', text: '發病 4.5 小時內溶解血栓、恢復中大腦動脈血流，搶救尚未壞死的缺血半影區；時間就是大腦。出血、近期手術、抗凝為禁忌。', textEn: 'Within 4.5 hours of onset dissolves the clot and restores MCA flow, rescuing the still-viable penumbra; time is brain. Bleeding, recent surgery and anticoagulation are contraindications.' },
        { id: 'thrombectomy', zh: '機械取栓', en: 'Mechanical thrombectomy', kind: 'procedure', targets: ['mcaM1'], pathway: 'mcaFlow', text: '大血管阻塞（M1）在 6 小時內（灌注影像選擇可達 24 小時）以支架取栓或抽吸再通；見神經外科／神經內科程序庫。', textEn: 'Large-vessel occlusion (M1) within 6 h (up to 24 h with perfusion selection) is reopened with a stent retriever or aspiration; see the neurosurgery / neurology libraries.' },
        { id: 'antiplatelet', zh: '抗血小板（aspirin ± clopidogrel）', en: 'Antiplatelets (aspirin ± clopidogrel)', kind: 'drug', targets: ['mca', 'aca', 'pca'], pathway: null, text: '二級預防：抑制血小板活化，減少再次栓塞；輕型中風／TIA 早期雙抗 21 天。溶栓後 24 小時內不給。', textEn: 'Secondary prevention: inhibit platelet activation to prevent recurrence; short dual therapy after minor stroke/TIA. Withheld for 24 h after thrombolysis.' },
        { id: 'rehab', zh: '神經復健（可塑性）', en: 'Neurorehabilitation (plasticity)', kind: 'procedure', targets: ['motor', 'broca'], pathway: 'corticospinal', text: '重複、任務導向訓練促使梗塞周邊與對側皮質重組；早期開始、持續數月。', textEn: 'Repetitive task-oriented training drives reorganisation of peri-infarct and contralateral cortex; start early, continue for months.' }
      ] },
    { id: 'hemorrhage', images: 'hemorrhage', zh: '高血壓性腦出血（右殼核）', en: 'Hypertensive intracerebral haemorrhage (right putamen)', modality: 'CT-like', dept: 'neurology',
      summary: '長期高血壓使深穿支小動脈變性破裂；CT 立刻顯示高密度血塊與周圍低密度水腫。治療重點是血壓、抗凝逆轉與顱內壓，而非溶栓。', summaryEn: 'Chronic hypertension degenerates deep perforating arterioles until they rupture; CT immediately shows a hyperdense clot with surrounding hypodense oedema. Management is blood pressure, anticoagulant reversal and intracranial pressure — never thrombolysis.',
      findings: ['殼核／內囊區高密度血塊', '周圍低密度水腫與佔位效應', '血腫體積（ABC/2）決定預後與手術'], findingsEn: ['Hyperdense clot in the putamen / internal capsule', 'Surrounding hypodense oedema and mass effect', 'Haematoma volume (ABC/2) guides prognosis and surgery'],
      highlight: [{ roi: 'putamenR', kind: 'lesion' }, { roi: 'ventricles', kind: 'label' }],
      therapies: [
        { id: 'bp', zh: '急性降血壓（nicardipine、labetalol）', en: 'Acute BP lowering (nicardipine, labetalol)', kind: 'drug', targets: ['putamenR'], pathway: null, text: '收縮壓目標約 140 mmHg（INTERACT2／ATACH-2），減少血腫擴大；避免過度降壓造成低灌注。', textEn: 'Target systolic ≈140 mmHg (INTERACT2 / ATACH-2) to limit haematoma expansion; avoid over-correction and hypoperfusion.' },
        { id: 'reversal', zh: '抗凝逆轉（PCC、vitamin K、idarucizumab、andexanet）', en: 'Anticoagulant reversal (PCC, vitamin K, idarucizumab, andexanet)', kind: 'drug', targets: ['putamenR'], pathway: null, text: '服用 warfarin 或 DOAC 者立即逆轉；血小板輸注對抗血小板使用者無益（PATCH）。', textEn: 'Reverse warfarin or DOACs immediately; platelet transfusion does not help antiplatelet users (PATCH).' },
        { id: 'decompression', zh: '手術減壓／血腫清除', en: 'Surgical decompression / clot evacuation', kind: 'procedure', targets: ['putamenR'], pathway: null, text: '小腦出血 >3 cm 或腦幹受壓者手術；幕上出血手術選擇個別化（微創清除）。見神經外科程序庫。', textEn: 'Operate for cerebellar haemorrhage >3 cm or brainstem compression; supratentorial surgery is individualised (minimally invasive evacuation). See the neurosurgery library.' }
      ] },
    { id: 'ms', images: 'ms', zh: '多發性硬化症', en: 'Multiple sclerosis', modality: 'FLAIR-like', dept: 'neurology',
      summary: '自體免疫去髓鞘：FLAIR 可見腦室周圍垂直於腦室的卵圓形病灶（Dawson 手指）、近皮質與胼胝體病灶；時間與空間多發性（McDonald 準則）。', summaryEn: 'Autoimmune demyelination: FLAIR shows periventricular ovoid lesions perpendicular to the ventricles (Dawson fingers), juxtacortical and callosal lesions; dissemination in time and space (McDonald criteria).',
      findings: ['腦室周圍卵圓形高訊號病灶', '胼胝體下緣病灶', '活動性病灶在對比劑後增強'], findingsEn: ['Periventricular ovoid hyperintense lesions', 'Lesions along the undersurface of the corpus callosum', 'Active lesions enhance with contrast'],
      highlight: [{ roi: 'pvwm', kind: 'lesion' }, { roi: 'corpusCallosum', kind: 'lesion' }],
      therapies: [
        { id: 'steroid', zh: '高劑量甲基類固醇（急性復發）', en: 'High-dose methylprednisolone (relapse)', kind: 'drug', targets: ['pvwm'], pathway: null, text: '縮短急性發炎去髓鞘的恢復時間，不改變長期失能；先排除感染與假性復發（發燒、感染使舊症狀再現）。', textEn: 'Shortens recovery from an acute inflammatory relapse without changing long-term disability; exclude infection and pseudo-relapse first.' },
        { id: 'natalizumab', zh: '高效疾病修飾藥（natalizumab、ocrelizumab）', en: 'High-efficacy DMTs (natalizumab, ocrelizumab)', kind: 'drug', targets: ['pvwm', 'corpusCallosum'], pathway: null, text: 'Natalizumab 阻斷淋巴球穿越血腦障壁進入病灶；ocrelizumab 清除 B 細胞。大幅減少新病灶，需監測 JC 病毒（PML）與感染。', textEn: 'Natalizumab blocks lymphocyte entry across the blood–brain barrier; ocrelizumab depletes B cells. Far fewer new lesions; monitor JC virus (PML) and infections.' },
        { id: 'interferon', zh: '干擾素 β／glatiramer', en: 'Interferon-β / glatiramer', kind: 'drug', targets: ['pvwm'], pathway: null, text: '中等療效的免疫調節，注射給藥，安全性長期資料最完整。', textEn: 'Moderate-efficacy immunomodulators given by injection with the longest safety record.' }
      ] },
    { id: 'glioma', images: 'glioma', zh: '膠質母細胞瘤（右額葉）', en: 'Glioblastoma (right frontal)', modality: 'T1 + contrast-like', dept: 'neurosurgery',
      summary: '對比劑後環狀增強、中央壞死、廣泛瘤周水腫與佔位效應；最大安全切除（5-ALA 螢光導引）後放療加 temozolomide（Stupp）。', summaryEn: 'Ring enhancement with central necrosis, extensive peritumoural oedema and mass effect; maximal safe resection (5-ALA guided) followed by radiotherapy plus temozolomide (Stupp protocol).',
      findings: ['環狀增強腫塊，中央壞死', '白質瘤周水腫（T1 低訊號、FLAIR 高訊號）', '中線偏移與腦室受壓'], findingsEn: ['Ring-enhancing mass with central necrosis', 'White-matter peritumoural oedema (T1 dark, FLAIR bright)', 'Midline shift and ventricular compression'],
      highlight: [{ roi: 'tumour', kind: 'lesion' }, { roi: 'tumourEdema', kind: 'atrophy' }, { roi: 'motor', kind: 'label' }],
      therapies: [
        { id: 'resection', zh: '最大安全切除（5-ALA）', en: 'Maximal safe resection (5-ALA)', kind: 'procedure', targets: ['tumour'], pathway: null, text: '口服 5-ALA 使腫瘤在藍光下發紅光，提高完整切除率；靠近運動皮質時用清醒開顱與皮質定位。見神經外科程序庫。', textEn: 'Oral 5-ALA makes tumour fluoresce red under blue light, raising complete-resection rates; near motor cortex use awake mapping. See the neurosurgery library.' },
        { id: 'temozolomide', zh: 'Temozolomide ＋ 放射治療', en: 'Temozolomide + radiotherapy', kind: 'drug', targets: ['tumour', 'tumourEdema'], pathway: null, text: '烷化劑破壞腫瘤 DNA，MGMT 啟動子甲基化者效果較佳；放療照射瘤床加 2 cm 邊緣。', textEn: 'Alkylating agent damages tumour DNA; better response with MGMT promoter methylation. Radiotherapy covers the tumour bed with a 2 cm margin.' },
        { id: 'dexamethasone', zh: 'Dexamethasone（水腫）', en: 'Dexamethasone (oedema)', kind: 'drug', targets: ['tumourEdema'], pathway: null, text: '減少血管源性水腫與佔位症狀；長期使用致高血糖、肌病、感染，應用最低有效量。', textEn: 'Reduces vasogenic oedema and mass-effect symptoms; long-term use causes hyperglycaemia, myopathy and infection — lowest effective dose.' },
        { id: 'levetiracetam', zh: 'Levetiracetam（癲癇）', en: 'Levetiracetam (seizures)', kind: 'drug', targets: ['frontal', 'motor'], pathway: null, text: '腫瘤相關癲癇首選，與化療交互作用少；無發作者不常規預防。', textEn: 'First choice for tumour-related seizures with few chemotherapy interactions; no routine prophylaxis without seizures.' }
      ] },
    { id: 'hydrocephalus', images: 'hydrocephalus', zh: '水腦症', en: 'Hydrocephalus', modality: 'T1', dept: 'neurosurgery',
      summary: '腦脊髓液循環受阻或吸收不良，腦室擴大、腦室周圍滲出；急性者頭痛嘔吐意識下降，常壓性水腦症則步態、認知、尿失禁三徵。', summaryEn: 'Obstructed CSF flow or impaired absorption dilates the ventricles with periventricular transependymal signal; acute cases present with headache, vomiting and drowsiness, normal-pressure hydrocephalus with gait, cognition and continence.',
      findings: ['側腦室與第三腦室明顯擴大（與腦溝不成比例）', '顳葉角擴大、第三腦室球形', '腦室周圍白質滲出訊號'], findingsEn: ['Lateral and third ventricles enlarged out of proportion to sulci', 'Temporal-horn dilation, rounded third ventricle', 'Periventricular transependymal signal'],
      highlight: [{ roi: 'ventricles', kind: 'lesion' }, { roi: 'thirdVentricle', kind: 'lesion' }, { roi: 'choroid', kind: 'label' }],
      therapies: [
        { id: 'vpshunt', zh: '腦室腹腔分流（VP shunt）', en: 'Ventriculoperitoneal shunt', kind: 'procedure', targets: ['ventricles', 'peritoneum'], pathway: 'csf', text: '導管自側腦室經皮下隧道引流至腹腔，閥門設定壓力；併發症：阻塞、感染、過度引流（硬腦膜下積液）。見神經外科程序庫。', textEn: 'A catheter drains the lateral ventricle through a subcutaneous tunnel to the peritoneum with a pressure-set valve; complications: obstruction, infection, over-drainage (subdural collection). See the neurosurgery library.' },
        { id: 'etv', zh: '內視鏡第三腦室造口（ETV）', en: 'Endoscopic third ventriculostomy', kind: 'procedure', targets: ['thirdVentricle', 'brainstem'], pathway: 'csf', text: '阻塞性水腦症在第三腦室底開窗，讓腦脊髓液繞過導水管流入腳間池；避開基底動脈。', textEn: 'For obstructive hydrocephalus, fenestrate the floor of the third ventricle so CSF bypasses the aqueduct into the interpeduncular cistern; stay clear of the basilar artery.' },
        { id: 'acetazolamide', zh: 'Acetazolamide（暫時）', en: 'Acetazolamide (temporising)', kind: 'drug', targets: ['choroid'], pathway: null, text: '抑制脈絡叢碳酸酐酶減少腦脊髓液產生，只作短期過渡，不取代分流。', textEn: 'Inhibits choroid-plexus carbonic anhydrase to reduce CSF production; short-term bridge only, not a substitute for shunting.' }
      ] },
    { id: 'tle-hs', images: 'tle-hs', zh: '顳葉癲癇（左海馬硬化）', en: 'Temporal-lobe epilepsy (left hippocampal sclerosis)', modality: 'FLAIR-like', dept: 'neurology',
      summary: '左海馬迴萎縮且 FLAIR 高訊號、內部結構消失；典型為先兆（上腹不適、似曾相識）後意識受損的局部發作。藥物難治者手術效果佳。', summaryEn: 'Left hippocampal atrophy with FLAIR hyperintensity and loss of internal architecture; typical focal seizures with aura (epigastric rising, déjà vu) then impaired awareness. Drug-resistant cases respond well to surgery.',
      findings: ['左海馬迴縮小、訊號增高（冠狀 FLAIR 最清楚）', '同側顳葉角擴大', '對側正常可作比較'], findingsEn: ['Smaller, brighter left hippocampus (best on coronal FLAIR)', 'Ipsilateral temporal-horn enlargement', 'Normal contralateral side for comparison'],
      highlight: [{ roi: 'hippocampusL', kind: 'lesion' }, { roi: 'amygdala', kind: 'label' }],
      therapies: [
        { id: 'asm', zh: '抗癲癇藥（lamotrigine、levetiracetam、carbamazepine）', en: 'Anti-seizure medicines (lamotrigine, levetiracetam, carbamazepine)', kind: 'drug', targets: ['hippocampusL', 'temporal', 'frontal'], pathway: null, text: '鈉通道阻斷或 SV2A 結合，降低皮質與海馬迴的異常同步放電；育齡女性避免 valproate。', textEn: 'Sodium-channel block or SV2A binding reduces abnormal synchronous firing in cortex and hippocampus; avoid valproate in women of childbearing potential.' },
        { id: 'lobectomy', zh: '前顳葉切除／海馬杏仁核切除', en: 'Anterior temporal lobectomy / amygdalohippocampectomy', kind: 'procedure', targets: ['hippocampusL', 'amygdala'], pathway: null, text: '切除硬化的海馬迴與杏仁核，約三分之二患者無發作；術前以 Wada／fMRI 評估記憶與語言側化。見神經外科程序庫。', textEn: 'Resecting the sclerotic hippocampus and amygdala renders about two-thirds seizure-free; Wada / fMRI lateralises memory and language first. See the neurosurgery library.' },
        { id: 'vns', zh: '迷走神經刺激（VNS）', en: 'Vagus nerve stimulation', kind: 'procedure', targets: ['brainstem', 'thalamus'], pathway: 'noradrenergic', text: '頸部迷走神經電極經孤束核、藍斑核投射調節皮質興奮性，減少發作頻率約一半。', textEn: 'A cervical vagal electrode modulates cortical excitability via the solitary nucleus and locus coeruleus, roughly halving seizure frequency.' }
      ] },
    { id: 'migraine', images: 'normal', zh: '偏頭痛', en: 'Migraine', modality: 'T1 (normal)', dept: 'neurology',
      summary: '結構影像正常。機轉：皮質擴散性抑制（先兆）啟動三叉神經血管系統，腦膜血管釋放 CGRP 造成搏動性頭痛；影像用來排除紅旗。', summaryEn: 'Structural imaging is normal. Mechanism: cortical spreading depression (aura) activates the trigeminovascular system; meningeal CGRP release drives throbbing pain. Imaging is for red flags.',
      findings: ['MRI 正常是常態', '非典型先兆、雷擊樣頭痛、神經學缺損才需影像'], findingsEn: ['Normal MRI is the rule', 'Imaging is for atypical aura, thunderclap headache or neurological deficits'],
      highlight: [{ roi: 'trigeminal', kind: 'lesion' }, { roi: 'meninges', kind: 'label' }, { roi: 'occipital', kind: 'atrophy' }],
      therapies: [
        { id: 'triptan', zh: '翠普登（sumatriptan）', en: 'Triptans (sumatriptan)', kind: 'drug', targets: ['trigeminal', 'meninges'], pathway: 'trigeminovascular', text: '5-HT1B/1D 促效：收縮腦膜血管、抑制三叉神經末梢釋放 CGRP；冠心病、腦血管病禁用，與 SSRI 併用注意血清素症候群。', textEn: '5-HT1B/1D agonists constrict meningeal vessels and inhibit trigeminal CGRP release; contraindicated in coronary or cerebrovascular disease; watch serotonin syndrome with SSRIs.' },
        { id: 'cgrp', zh: 'CGRP 單株抗體（erenumab、fremanezumab）', en: 'CGRP antibodies (erenumab, fremanezumab)', kind: 'drug', targets: ['trigeminal', 'meninges'], pathway: 'trigeminovascular', text: '阻斷 CGRP 或其受體，預防性每月皮下注射，減少每月頭痛天數。', textEn: 'Block CGRP or its receptor; monthly subcutaneous prevention that reduces headache days.' },
        { id: 'preventive', zh: '預防藥（propranolol、topiramate、amitriptyline）', en: 'Preventives (propranolol, topiramate, amitriptyline)', kind: 'drug', targets: ['occipital', 'thalamus', 'frontal'], pathway: null, text: '降低皮質興奮性與視丘—皮質疼痛處理；每月 ≥4 天頭痛即考慮。', textEn: 'Lower cortical excitability and thalamocortical pain processing; consider from ≥4 headache days a month.' }
      ] },
    { id: 'depression', images: 'normal', zh: '重度憂鬱症', en: 'Major depression', modality: 'T1 (normal)', dept: 'psychiatry',
      summary: '結構影像大致正常（長期可見海馬迴略小）；功能上前額葉—邊緣系統調節失衡，單胺（血清素、正腎上腺素、多巴胺）訊號不足。', summaryEn: 'Structural imaging is essentially normal (slightly smaller hippocampi with chronicity); functionally a prefrontal–limbic imbalance with deficient monoamine (serotonin, noradrenaline, dopamine) signalling.',
      findings: ['影像用於排除器質性原因', '功能影像：背外側前額葉活性低、杏仁核反應過強'], findingsEn: ['Imaging excludes organic causes', 'Functional imaging: hypoactive DLPFC, hyper-reactive amygdala'],
      highlight: [{ roi: 'dlpfc', kind: 'atrophy' }, { roi: 'amygdala', kind: 'lesion' }, { roi: 'hippocampus', kind: 'label' }, { roi: 'raphe', kind: 'label' }],
      therapies: [
        { id: 'ssri', zh: 'SSRI（sertraline、escitalopram）', en: 'SSRIs (sertraline, escitalopram)', kind: 'drug', targets: ['amygdala', 'hippocampus', 'dlpfc'], pathway: 'serotonergic', text: '阻斷血清素再回收，中縫核投射到邊緣與前額葉的血清素訊號增強；2–4 週後受體與神經可塑性改變才見效。', textEn: 'Block serotonin reuptake, strengthening raphe projections to limbic and prefrontal targets; benefit follows receptor and plasticity changes over 2–4 weeks.', caution: '與 MAOI、tramadol、翠普登併用血清素症候群；青少年早期自殺意念監測。', cautionEn: 'Serotonin syndrome with MAOIs, tramadol, triptans; monitor early suicidality in adolescents.' },
        { id: 'snri', zh: 'SNRI（venlafaxine、duloxetine）', en: 'SNRIs (venlafaxine, duloxetine)', kind: 'drug', targets: ['dlpfc', 'thalamus', 'amygdala'], pathway: 'noradrenergic', text: '同時增強血清素與正腎上腺素（藍斑核投射），對合併疼痛者有利；注意血壓。', textEn: 'Boost both serotonin and noradrenaline (locus coeruleus projections); useful with comorbid pain; watch blood pressure.' },
        { id: 'ketamine', zh: 'Esketamine／ketamine', en: 'Esketamine / ketamine', kind: 'drug', targets: ['dlpfc', 'acc'], pathway: null, text: 'NMDA 拮抗快速促進前額葉突觸生成，數小時內改善難治性憂鬱；需監測血壓與解離。', textEn: 'NMDA antagonism rapidly promotes prefrontal synaptogenesis, improving treatment-resistant depression within hours; monitor blood pressure and dissociation.' },
        { id: 'rtms', zh: '重複經顱磁刺激（左 DLPFC）', en: 'rTMS (left DLPFC)', kind: 'procedure', targets: ['dlpfc'], pathway: null, text: '高頻磁脈衝活化左背外側前額葉，非侵入、不需麻醉；每日療程數週。', textEn: 'High-frequency magnetic pulses activate the left DLPFC; non-invasive, no anaesthesia; daily sessions for weeks.' }
      ] }
  ]
};
