import React, { useState, useEffect, useRef } from 'react';
import { Play, Search, AlertCircle, ChevronLeft, ChevronRight, Eye, EyeOff, Eraser, LayoutGrid, Edit2, Video, Lightbulb, LightbulbOff, Gauge, Puzzle, RefreshCw, MousePointer2, Blocks, X, Sparkles } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection } from 'firebase/firestore';

let app, auth, db, appId;
if (typeof __firebase_config !== 'undefined' && __firebase_config) {
    try {
        const firebaseConfig = JSON.parse(__firebase_config);
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    } catch (e) {
        console.error("Firebase Init Error:", e);
    }
}

// 併發請求機制 (完美版)：加入中斷器，贏家產生後立刻斬斷其他連線
const fetchFirstValid = (urls, timeout = 5000) => {
    return new Promise((resolve, reject) => {
        let failures = 0;
        let isResolved = false;
        const controllers = urls.map(() => new AbortController()); // 建立專屬控制器
        
        if (!urls || urls.length === 0) {
            reject(new Error('No URLs provided'));
            return;
        }

        urls.forEach((url, index) => {
            const controller = controllers[index];
            const id = setTimeout(() => controller.abort(), timeout);
            
            fetch(url, { signal: controller.signal })
                .then(res => {
                    clearTimeout(id);
                    if (res.ok && !isResolved) {
                        isResolved = true;
                        // 成功後，立刻斬斷其他還在苦苦等待的請求，釋放網路資源！
                        controllers.forEach((ctrl, i) => { if (i !== index) ctrl.abort(); });
                        resolve(res);
                    } else if (!res.ok) {
                        throw new Error('HTTP ' + res.status);
                    }
                })
                .catch(err => {
                    clearTimeout(id);
                    if (!isResolved) {
                        failures++;
                        if (failures === urls.length) {
                            reject(new Error('All fallback URLs failed or timed out'));
                        }
                    }
                });
        });
    });
};

// 純前端 Big5 編碼器 (完美版：連續記憶體解碼 + 第一順位鎖定)
let big5MapCache = null;

const initBig5Cache = () => {
  if (!window.TextDecoder || big5MapCache) return;
  
  big5MapCache = {};
  const decoder = new TextDecoder('big5');
  const pairs = [];
  for (let high = 0xA1; high <= 0xF9; high++) {
    for (let low = 0x40; low <= 0xFE; low++) {
      if (low > 0x7E && low < 0xA1) continue;
      pairs.push([high, low]);
    }
  }
  
  // 放棄使用 \x00 分隔符，直接將所有 byte 連續拼裝
  const buffer = new Uint8Array(pairs.length * 2);
  for (let i = 0; i < pairs.length; i++) {
    buffer[i * 2] = pairs[i][0];
    buffer[i * 2 + 1] = pairs[i][1];
  }
  
  const decodedString = decoder.decode(buffer);
  // Array.from 可以完美將字串拆分為單一「Unicode 字元」陣列，徹底防止任何偏移錯位
  const charsArray = Array.from(decodedString); 
  
  for (let i = 0; i < pairs.length; i++) {
    const char = charsArray[i];
    // 關鍵修正：加入 !big5MapCache[char]
    // Big5 擴充區塊有許多重複字。我們只保留第一次遇到的 Hex (即最標準常用的代碼)，
    // 避免標準字被冷僻代碼覆蓋，導致去伺服器找不到檔案！
    if (char && char !== '\uFFFD' && !big5MapCache[char]) { 
      const hex = (pairs[i][0].toString(16) + pairs[i][1].toString(16)).toUpperCase();
      big5MapCache[char] = hex;
    }
  }
};

const getBig5Hex = (targetChar) => {
  if (!window.TextDecoder) return null;
  if (!big5MapCache) initBig5Cache();
  return big5MapCache[targetChar] || null;
};

const COMPONENT_COLORS = ['#a855f7', '#22c55e', '#eab308', '#ef4444', '#3b82f6', '#ec4899', '#06b6d4'];

// 升級版字典
const CHAR_COMPONENTS_MAP = {
  '歉': { structure: '左右拼', components: ['兼', '欠'] },
  '謙': { structure: '左右拼', components: ['言', '兼'] },
  '賺': { structure: '左右拼', components: ['貝', '兼'] },
  '嫌': { structure: '左右拼', components: ['女', '兼'] },
  '明': { structure: '左右拼', components: ['日', '月'] },
  '休': { structure: '左右拼', components: ['人', '木'] },
  '林': { structure: '左右拼', components: ['木', '木'] },
  '森': { structure: '上下拼', components: ['木', '林'] },
  '想': { structure: '上下拼', components: ['相', '心'] },
  '相': { structure: '左右拼', components: ['木', '目'] },
  '照': { structure: '上下拼', components: ['昭', '火'] },
  '昭': { structure: '左右拼', components: ['日', '召'] },
  '說': { structure: '左右拼', components: ['言', '兌'] },
  '語': { structure: '左右拼', components: ['言', '吾'] },
  '清': { structure: '左右拼', components: ['水', '青'] },
  '情': { structure: '左右拼', components: ['心', '青'] },
  '晴': { structure: '左右拼', components: ['日', '青'] },
  '江': { structure: '左右拼', components: ['水', '工'] },
  '村': { structure: '左右拼', components: ['木', '寸'] },
  '調': { structure: '左右拼', components: ['言', '周'] },
  '周': { structure: '上包下', components: ['冂', '吉'] },
  '困': { structure: '全包圍', components: ['囗', '木'] },
  '回': { structure: '全包圍', components: ['囗', '口'] },
  '圓': { structure: '全包圍', components: ['囗', '員'] },
  '朋': { structure: '左右拼', components: ['月', '月'] },
  '葉': { structure: '上中下拼', components: ['艹', '世', '木'] },
  '謝': { structure: '左中右拼', components: ['言', '身', '寸'] },
  '間': { structure: '上包下', components: ['門', '日'] },
  '凶': { structure: '下包上', components: ['乂', '凵'] },
  '函': { structure: '下包上', components: ['?', '凵'] },
  '大': { structure: '獨體字', components: [] },
  '上': { structure: '獨體字', components: [] }
};

const DEFAULT_SPLITS = {
  '湖': [3, 5, 4], '歉': [10, 4]
};

const analyzeCharacterWithAI = async (targetChar) => {
  const apiKey = ""; 
  if (!apiKey || apiKey.trim() === "") return { structure: '左右拼', components: [] };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

  const prompt = `請分析中文字「${targetChar}」的字體結構與部件。
  要求回傳 JSON 格式，必須包含以下兩個欄位：
  1. "structure": 字體空間結構類型，請嚴格從以下選項中選一個：「獨體字」、「全包圍」、「上下拼」、「左右拼」、「上中下拼」、「左中右拼」、「上包下」、「下包上」、「左包右」、「左上包」、「左下包」、「右上包」。
  2. "components": 拆解出的直接中文字部件陣列（例如：["木", "木"]）。若是獨體字且無法再拆解，請回傳空陣列 []。`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          structure: { type: "STRING" },
          components: { type: "ARRAY", items: { type: "STRING" } }
        }
      }
    }
  };

  const delays = [1000, 2000, 4000]; 
  for (let i = 0; i < 3; i++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (response.status === 400 || response.status === 403) return { structure: '左右拼', components: [] };
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      
      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return JSON.parse(text);
      return { structure: '左右拼', components: [] };
    } catch (error) {
      if (i === 2) return { structure: '左右拼', components: [] };
      await new Promise(res => setTimeout(res, delays[i]));
    }
  }
  return { structure: '左右拼', components: [] };
};

export default function App() {
  const getInitialChar = () => {
    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search);
        const word = params.get('word');
        if (word && word.trim().length > 0) return word.trim().charAt(0);
      } catch(e) {}
    }
    return '圓';
  };

  const initialChar = getInitialChar();
  const [char, setChar] = useState(initialChar);
  const [parentChar, setParentChar] = useState(initialChar);
  const [inputChar, setInputChar] = useState('');
  const [mode, setMode] = useState('component');
  const [strokesData, setStrokesData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showOutline, setShowOutline] = useState(true);
  const [currentStrokeNum, setCurrentStrokeNum] = useState(0); 
  const [isPlaying, setIsPlaying] = useState(false);
  const [userPath, setUserPath] = useState([]);
  const [feedback, setFeedback] = useState(null); 
  const [playDelay, setPlayDelay] = useState(800); 
  const [showHint, setShowHint] = useState(true);  
  
  const [numToHide, setNumToHide] = useState(3);
  const [requireStrokeOrder, setRequireStrokeOrder] = useState(true);
  const [hiddenStrokes, setHiddenStrokes] = useState([]);
  const [placedStrokes, setPlacedStrokes] = useState([]);
  const [availablePieces, setAvailablePieces] = useState([]);
  const [selectedPiece, setSelectedPiece] = useState(null);
  const [draggingPiece, setDraggingPiece] = useState(null);
  const [wrongPiece, setWrongPiece] = useState(null);

  const [componentGroups, setComponentGroups] = useState([]);
  const [placedComps, setPlacedComps] = useState([]);
  const [availableComps, setAvailableComps] = useState([]);
  const [selectedComp, setSelectedComp] = useState(null);
  const [draggingComp, setDraggingComp] = useState(null);
  const [wrongComp, setWrongComp] = useState(null);
  const [numComps, setNumComps] = useState(3); 
  const [requireOrder, setRequireOrder] = useState(true);
  const [errorCount, setErrorCount] = useState(0);

  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const isDrawingRef = useRef(false);
  const pathRef = useRef([]);
  const canvasRef = useRef(null);

  const [user, setUser] = useState(null);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customPatternInput, setCustomPatternInput] = useState('');
  const [customSplitError, setCustomSplitError] = useState('');

  const [customDictionary, setCustomDictionary] = useState({});
  const [userCustomSplitsMap, setUserCustomSplitsMap] = useState({});

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const url = new URL(window.location);
        if (url.searchParams.get('word') !== char) {
          url.searchParams.set('word', char);
          window.history.pushState({ char }, '', url);
        }
      } catch (e) {}
    }
  }, [char]);

  useEffect(() => {
    const handlePopState = () => {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const word = params.get('word');
        if (word && word.trim().length > 0) {
          const newChar = word.trim().charAt(0);
          setChar(newChar);
          setParentChar(newChar);
        }
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const fetchCustomDict = async () => {
      try {
        const response = await fetch('https://aday0123.github.io/data/bujianSplitOrder.txt');
        if (!response.ok) throw new Error('Failed to fetch');
        const text = await response.text();
        const dict = {};
        const lines = text.split('\n');
        for (let line of lines) {
          line = line.trim();
          if (!line) continue;
          const targetChar = line.charAt(0);
          const numsStr = line.slice(1).trim();
          let pattern = [];
          if (numsStr.includes(' ')) {
            pattern = numsStr.split(/\s+/).map(Number);
          } else {
            pattern = numsStr.split('').map(Number);
          }
          pattern = pattern.filter(n => !isNaN(n) && n > 0);
          if (pattern.length > 0) dict[targetChar] = pattern;
        }
        setCustomDictionary(dict);
      } catch (error) {
        console.error("Error fetching custom dictionary:", error);
      }
    };
    fetchCustomDict();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      initBig5Cache();
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  const [componentsMap, setComponentsMap] = useState(CHAR_COMPONENTS_MAP);
  const [isAnalyzingAI, setIsAnalyzingAI] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchAI = async () => {
      if (parentChar && componentsMap[parentChar] === undefined) {
        setIsAnalyzingAI(true);
        const result = await analyzeCharacterWithAI(parentChar);
        if (isMounted) {
          setComponentsMap(prev => ({ 
            ...prev, 
            [parentChar]: result
          }));
          setIsAnalyzingAI(false);
        }
      }
    };
    fetchAI();
    return () => { isMounted = false; };
  }, [parentChar, componentsMap]);

  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch(e) {
        console.error("Auth error", e);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const fetchStrokeData = async () => {
      if (!char) return;
      setIsLoading(true);
      setError('');
      setIsPlaying(false);
      setFeedback(null);
      setUserPath([]);
      pathRef.current = [];
      isDrawingRef.current = false;
      setStrokesData([]);
      setComponentGroups([]);
      setHiddenStrokes([]);
      setAvailableComps([]);
      setAvailablePieces([]);
      setErrorCount(0);
      
      try {
        const unicodeHex = char.codePointAt(0).toString(16);
        const hexLower = unicodeHex.toLowerCase();
        const hexUpper = unicodeHex.toUpperCase();
        
        // 加入 GitHub Raw 當作備援，防止 CDN 抽風
        const urlsToTry = [
            `https://cdn.jsdelivr.net/gh/c9s/zh-stroke-data@master/utf8/${hexLower}.xml`,
            `https://cdn.jsdelivr.net/gh/c9s/zh-stroke-data@master/utf8/${hexUpper}.xml`,
            `https://raw.githubusercontent.com/c9s/zh-stroke-data/master/utf8/${hexLower}.xml`
        ];
        
        const big5Hex = getBig5Hex(char);
        if (big5Hex) {
            const b5Upper = big5Hex.toUpperCase();
            const b5Lower = big5Hex.toLowerCase();
            urlsToTry.push(`https://cdn.jsdelivr.net/gh/c9s/zh-stroke-data@master/data/${b5Upper}.xml`);
            urlsToTry.push(`https://cdn.jsdelivr.net/gh/c9s/zh-stroke-data@master/data/${b5Lower}.xml`);
            urlsToTry.push(`https://raw.githubusercontent.com/c9s/zh-stroke-data/master/data/${b5Upper}.xml`);
        }
        
        let response;
        try {
            response = await fetchFirstValid(urlsToTry, 5000);
        } catch (err) {
            throw new Error('查無此字的教育部筆順資料');
        }
        
        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        if (xmlDoc.getElementsByTagName("parsererror").length > 0) throw new Error("XML 解析失敗");

        const strokeNodes = xmlDoc.getElementsByTagName('Stroke');
        if (strokeNodes.length === 0) throw new Error('此字無筆順資料');
        
        const mappedData = Array.from(strokeNodes).map((strokeNode) => {
            const outline = strokeNode.getElementsByTagName('Outline')[0];
            const track = strokeNode.getElementsByTagName('Track')[0];
            let pathString = '';
            if (outline) {
                Array.from(outline.children).forEach(node => {
                    const tag = node.tagName.toLowerCase();
                    if (tag === 'moveto') pathString += `M ${node.getAttribute('x')} ${node.getAttribute('y')} `;
                    else if (tag === 'lineto') pathString += `L ${node.getAttribute('x')} ${node.getAttribute('y')} `;
                    else if (tag === 'quadto') pathString += `Q ${node.getAttribute('x1')} ${node.getAttribute('y1')} ${node.getAttribute('x2')} ${node.getAttribute('y2')} `;
                    else if (tag === 'cubicto') pathString += `C ${node.getAttribute('x1')} ${node.getAttribute('y1')} ${node.getAttribute('x2')} ${node.getAttribute('y2')} ${node.getAttribute('x3')} ${node.getAttribute('y3')} `;
                    else if (tag === 'point') pathString += (pathString.length === 0 ? 'M' : 'L') + ` ${node.getAttribute('x')} ${node.getAttribute('y')} `;
                });
            }
            let median = [];
            const targetNodeForMedian = track || outline; 
            if (targetNodeForMedian) {
                Array.from(targetNodeForMedian.children).forEach(node => {
                    let pts = [];
                    if (node.hasAttribute('x')) pts.push({ x: parseFloat(node.getAttribute('x')), y: parseFloat(node.getAttribute('y')) });
                    if (node.hasAttribute('x1')) pts.push({ x: parseFloat(node.getAttribute('x1')), y: parseFloat(node.getAttribute('y1')) });
                    if (node.hasAttribute('x2')) pts.push({ x: parseFloat(node.getAttribute('x2')), y: parseFloat(node.getAttribute('y2')) });
                    if (node.hasAttribute('x3')) pts.push({ x: parseFloat(node.getAttribute('x3')), y: parseFloat(node.getAttribute('y3')) });
                    pts.forEach(pt => {
                        if (!isNaN(pt.x) && !isNaN(pt.y)) median.push({ x: (pt.x / 2048) * 280, y: (pt.y / 2048) * 280 });
                    });
                }
            )}
            return { pathString: pathString.trim(), median: median };
        });
        
        setStrokesData(mappedData);

        if (mode === 'play') setCurrentStrokeNum(mappedData.length);
        else if (mode === 'practice') setCurrentStrokeNum(0);
        
      } catch (err) {
        setError(`找不到「${char}」的資料，請確認是否為常用字。`);
        setStrokesData([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchStrokeData();
  }, [char]); 

  const initPuzzle = () => {
    if (strokesData.length === 0) return;
    const hideCount = Math.min(numToHide, strokesData.length);
    let indices = Array.from({ length: strokesData.length }, (_, i) => i);
    indices.sort(() => Math.random() - 0.5);
    let toHide = indices.slice(0, hideCount).sort((a, b) => a - b);
    setHiddenStrokes(toHide);
    setPlacedStrokes([]);
    setSelectedPiece(null);
    setDraggingPiece(null);
    setFeedback(null);
    setErrorCount(0);
    setAvailablePieces([...toHide].sort(() => Math.random() - 0.5));
  };

  const initComponentPuzzle = (manualK = null) => {
    const N = strokesData.length;
    if (N === 0) return;

    const availablePatterns = [
        userCustomSplitsMap[char],
        customDictionary[char],
        DEFAULT_SPLITS[char]
    ].filter(p => p && p.reduce((a,b) => a+b, 0) === N);

    if (availablePatterns.length > 0) {
        let matchedPattern = null;
        if (manualK === null) {
            matchedPattern = availablePatterns[0];
        } else {
            matchedPattern = availablePatterns.find(p => p.length === manualK) || null;
        }

        if (matchedPattern) {
            applyCustomSplit(matchedPattern);
            return; 
        }
    }

    let groups = [];
    let structureType = '左右拼';
    let compLength = 2;
    let isSingleBody = false;

    const aiData = componentsMap[char];
    if (aiData) {
        if (Array.isArray(aiData)) {
            compLength = aiData.length;
            if (compLength === 0) isSingleBody = true;
        } else {
            structureType = aiData.structure || '左右拼';
            compLength = (aiData.components || []).length;
            if (structureType === '獨體字' || compLength === 0) isSingleBody = true;
        }
    }

    let K = numComps;

    if (manualK === null) {
        if (N <= 5) {
            K = N; 
        } else if (structureType === '全包圍') {
            K = 3; 
        } else if (structureType === '左中右拼' || structureType === '上中下拼') {
            K = 3;
        } else if (structureType.includes('包')) {
            K = 2; 
        } else if (isSingleBody) {
            K = 2; 
        } else {
            K = compLength > 0 ? compLength : 2; 
        }
        K = Math.max(1, Math.min(K, N));
        setNumComps(K);
    } else {
        K = Math.min(manualK, N);
    }

    if (K >= N) {
      for (let i = 0; i < N; i++) groups.push([i]);
    } else {
      const strokeDist = Array(N).fill(0).map(() => Array(N).fill(0));
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          let minDist = Infinity;
          const pts1 = strokesData[i].median || [];
          const pts2 = strokesData[j].median || [];
          if (pts1.length > 0 && pts2.length > 0) {
            for (let p1 of pts1) {
              for (let p2 of pts2) {
                const d2 = Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2);
                if (d2 < minDist) minDist = d2;
              }
            }
            minDist = Math.sqrt(minDist);
          } else {
            minDist = 0;
          }
          strokeDist[i][j] = minDist;
          strokeDist[j][i] = minDist;
        }
      }

      const bboxes = Array(N).fill(0).map(() => Array(N).fill(null));
      for (let i = 0; i < N; i++) {
        for (let j = i; j < N; j++) {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (let s = i; s <= j; s++) {
            if (strokesData[s] && strokesData[s].median) {
              strokesData[s].median.forEach(p => {
                if (p.x < minX) minX = p.x;
                if (p.x > maxX) maxX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.y > maxY) maxY = p.y;
              });
            }
          }
          if (minX === Infinity) {
              bboxes[i][j] = { minX: 0, maxX: 0, minY: 0, maxY: 0, area: 0 };
          } else {
              const w = Math.max(maxX - minX, 10);
              const h = Math.max(maxY - minY, 10);
              bboxes[i][j] = { minX, maxX, minY, maxY, area: w * h };
          }
        }
      }

      const partitions = [];
      let partitionCount = 0;
      const MAX_PARTITIONS = 3000; 

      const getPartitions = (start, partsLeft, currentCuts) => {
        if (partitionCount >= MAX_PARTITIONS) return; 
        
        if (partsLeft === 1) {
          partitions.push([...currentCuts, N]);
          partitionCount++;
          return;
        }
        for (let i = start + 1; i <= N - partsLeft + 1; i++) {
          getPartitions(i, partsLeft - 1, [...currentCuts, i]);
          if (partitionCount >= MAX_PARTITIONS) return; 
        }
      };
      getPartitions(0, K, [0]);

      let bestScore = Infinity;
      let bestPartition = null;
      const isEnclosure = structureType.includes('包') || structureType.includes('圍');

      for (let k = 0; k < partitions.length; k++) {
        const cuts = partitions[k];
        let areaSum = 0;
        let singleStrokeCount = 0;
        const chunksBoxes = [];
        let cx = [], cy = [];

        for (let i = 0; i < cuts.length - 1; i++) {
          const start = cuts[i];
          const end = cuts[i+1] - 1;
          const box = bboxes[start][end];
          chunksBoxes.push(box);
          areaSum += box.area;
          
          let ptsX = 0, ptsY = 0, ptsCount = 0;
          for(let s = start; s <= end; s++) {
              if(strokesData[s] && strokesData[s].median) {
                  strokesData[s].median.forEach(p => { ptsX+=p.x; ptsY+=p.y; ptsCount++; });
              }
          }
          cx.push(ptsCount ? ptsX/ptsCount : 140);
          cy.push(ptsCount ? ptsY/ptsCount : 140);

          if (end === start) {
              if (structureType === '全包圍' && end === N - 1) {
              } else if (N <= 5) {
              } else {
                  singleStrokeCount++;
              }
          }
        }

        let spatialPenalty = 0;
        if (structureType === '左中右拼' && chunksBoxes.length === 3) {
            if (cx[0] >= cx[1] - 5) spatialPenalty += 500000;
            if (cx[1] >= cx[2] - 5) spatialPenalty += 500000;
        } else if (structureType === '左右拼' && chunksBoxes.length === 2) {
            if (cx[0] >= cx[1] - 5) spatialPenalty += 500000;
        } else if (structureType === '上中下拼' && chunksBoxes.length === 3) {
            if (cy[0] >= cy[1] - 5) spatialPenalty += 500000;
            if (cy[1] >= cy[2] - 5) spatialPenalty += 500000;
        } else if (structureType === '上下拼' && chunksBoxes.length === 2) {
            if (cy[0] >= cy[1] - 5) spatialPenalty += 500000;
        }

        let overlapPenalty = 0;
        let enclosureReward = 0; 

        for (let i = 0; i < chunksBoxes.length; i++) {
          for (let j = i + 1; j < chunksBoxes.length; j++) {
            const b1 = chunksBoxes[i];
            const b2 = chunksBoxes[j];
            const ix = Math.max(0, Math.min(b1.maxX, b2.maxX) - Math.max(b1.minX, b2.minX));
            const iy = Math.max(0, Math.min(b1.maxY, b2.maxY) - Math.max(b1.minY, b2.minY));
            const intersectArea = ix * iy;

            if (intersectArea > 0) {
              const minArea = Math.min(b1.area, b2.area);
              if (isEnclosure) {
                  if (intersectArea / minArea > 0.5) {
                      enclosureReward += intersectArea * 15.0; 
                  } else {
                      overlapPenalty += intersectArea * 0.2;
                  }
              } else {
                  overlapPenalty += intersectArea * 3.0;
              }
            }
          }
        }

        let connectionPenalty = 0;
        for (let i = 0; i < N; i++) {
            for (let j = i + 1; j < N; j++) {
                if (strokeDist[i][j] < 15) {
                    let groupI = -1, groupJ = -1;
                    for (let c = 0; c < cuts.length - 1; c++) {
                        if (i >= cuts[c] && i < cuts[c+1]) groupI = c;
                        if (j >= cuts[c] && j < cuts[c+1]) groupJ = c;
                    }
                    if (groupI !== groupJ && groupI !== -1 && groupJ !== -1) {
                        connectionPenalty += Math.pow(15 - strokeDist[i][j], 2) * 100;
                    }
                }
            }
        }

        let singleStrokePenalty = singleStrokeCount * 50000;
        let score = overlapPenalty - enclosureReward + (areaSum * 0.1) + singleStrokePenalty + connectionPenalty + spatialPenalty;

        if (score < bestScore) {
          bestScore = score;
          bestPartition = cuts;
        }
      }

      for (let c = 0; c < bestPartition.length - 1; c++) {
        const g = [];
        for (let i = bestPartition[c]; i < bestPartition[c + 1]; i++) g.push(i);
        groups.push(g);
      }
    }

    setComponentGroups(groups);
    setPlacedComps([]);
    setSelectedComp(null);
    setDraggingComp(null);
    setFeedback(null);
    setErrorCount(0);
    let indices = Array.from({ length: groups.length }, (_, i) => i);
    indices.sort(() => Math.random() - 0.5); 
    setAvailableComps(indices);
  };

  const applyCustomSplit = (pattern) => {
    const groups = [];
    let currentIdx = 0;
    for (const count of pattern) {
        const group = [];
        for (let i = 0; i < count; i++) {
            group.push(currentIdx++);
        }
        groups.push(group);
    }
    setComponentGroups(groups);
    setNumComps(groups.length);
    setPlacedComps([]);
    setSelectedComp(null);
    setDraggingComp(null);
    setFeedback(null);
    setErrorCount(0);
    let indices = Array.from({ length: groups.length }, (_, i) => i);
    indices.sort(() => Math.random() - 0.5); 
    setAvailableComps(indices);
  };

  useEffect(() => {
    if (mode === 'puzzle' && strokesData.length > 0) initPuzzle();
  }, [mode, strokesData, numToHide]);

  useEffect(() => {
    if (strokesData.length === 0) return;

    const loadSplit = async () => {
       if (userCustomSplitsMap[char] && userCustomSplitsMap[char].reduce((a,b) => a+b, 0) === strokesData.length) {
           applyCustomSplit(userCustomSplitsMap[char]);
           return;
       }

       if (user && db) {
           try {
               const unicodeHex = char.codePointAt(0).toString(16).toLowerCase();
               if (unicodeHex) {
                   const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'customSplits', unicodeHex);
                   const docSnap = await getDoc(docRef);
                   if (docSnap.exists()) {
                       const pattern = docSnap.data().splitPattern;
                       if (pattern && pattern.reduce((a,b)=>a+b, 0) === strokesData.length) {
                           setUserCustomSplitsMap(prev => ({...prev, [char]: pattern}));
                           applyCustomSplit(pattern);
                           return; 
                       }
                   }
               }
           } catch (e) {
               console.error("Failed to load custom split", e);
           }
       }

       if (customDictionary[char] && customDictionary[char].reduce((a,b) => a+b, 0) === strokesData.length) {
           applyCustomSplit(customDictionary[char]);
           return;
       }
       
       if (DEFAULT_SPLITS[char] && DEFAULT_SPLITS[char].reduce((a,b) => a+b, 0) === strokesData.length) {
           applyCustomSplit(DEFAULT_SPLITS[char]);
           return;
       }

       initComponentPuzzle(null);
    };
    loadSplit();
  }, [mode, strokesData, user, char, isAnalyzingAI, customDictionary]); 

  const handleSaveCustomSplit = async () => {
      if (!user || !db) {
          setCustomSplitError("無法連接至雲端資料庫");
          return;
      }

      let normalizedInput = customPatternInput.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
      let rawParts = normalizedInput.match(/\d+/g);
      if (!rawParts) {
          setCustomSplitError("請輸入有效的數字組合");
          return;
      }

      let pattern = [];
      if (rawParts.length === 1 && Number(rawParts[0]) > strokesData.length) {
          pattern = rawParts[0].split('').map(Number);
      } else {
          pattern = rawParts.map(Number);
      }

      const sum = pattern.reduce((a, b) => a + b, 0);
      if (sum !== strokesData.length) {
          setCustomSplitError(`總筆畫數不符！此字共 ${strokesData.length} 畫，您的設定總和為 ${sum} 畫。`);
          return;
      }

      try {
          const unicodeHex = char.codePointAt(0).toString(16).toLowerCase();
          const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'customSplits', unicodeHex);
          await setDoc(docRef, {
              char,
              splitPattern: pattern,
              updatedAt: new Date().toISOString()
          });
          setShowCustomModal(false);
          setUserCustomSplitsMap(prev => ({...prev, [char]: pattern}));
          applyCustomSplit(pattern);
      } catch (e) {
          setCustomSplitError("儲存失敗：" + e.message);
      }
  };

  const handleModeChange = (newMode) => {
    setMode(newMode);
    setIsPlaying(false);
    setUserPath([]);
    setFeedback(null);
    pathRef.current = [];
    isDrawingRef.current = false;
    setSelectedPiece(null); 
    setDraggingPiece(null);
    setWrongPiece(null);
    setSelectedComp(null);
    setDraggingComp(null);
    setWrongComp(null);
    setErrorCount(0);
    if (newMode === 'practice') setCurrentStrokeNum(0); 
    else if (newMode === 'play') setCurrentStrokeNum(0); 
  };

  const getComponentCenter = (group) => {
    let totalX = 0, totalY = 0, count = 0;
    group.forEach(strokeIdx => {
      const median = strokesData[strokeIdx]?.median || [];
      median.forEach(p => { totalX += p.x; totalY += p.y; count++; });
    });
    if (count === 0) return { x: 140, y: 140 };
    return { x: totalX / count, y: totalY / count };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || strokesData.length === 0) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(280 / 2048, 280 / 2048);
    
    if (showOutline) {
      if ((mode === 'practice' || mode === 'play') && componentGroups.length > 0) {
        ctx.globalAlpha = 0.1;
        componentGroups.forEach((group, compIdx) => {
          const color = COMPONENT_COLORS[compIdx % COMPONENT_COLORS.length];
          ctx.fillStyle = color;
          group.forEach(strokeIdx => {
            if (strokesData[strokeIdx]) ctx.fill(new Path2D(strokesData[strokeIdx].pathString));
          });
        });
        ctx.globalAlpha = 1.0;
      } else {
        ctx.fillStyle = '#f3f4f6'; 
        strokesData.forEach(s => ctx.fill(new Path2D(s.pathString)));
      }
    }
    
    if (mode === 'puzzle') {
      ctx.fillStyle = '#111827'; 
      strokesData.forEach((s, i) => {
        if (!hiddenStrokes.includes(i) || placedStrokes.includes(i)) {
          ctx.fill(new Path2D(s.pathString));
        }
      });
    } else if (mode === 'component') {
      placedComps.forEach(compIdx => {
        const color = COMPONENT_COLORS[compIdx % COMPONENT_COLORS.length];
        ctx.fillStyle = color;
        if (componentGroups[compIdx]) {
          componentGroups[compIdx].forEach(strokeIdx => {
            if (strokesData[strokeIdx]) ctx.fill(new Path2D(strokesData[strokeIdx].pathString));
          });
        }
      });
    } else {
      for (let i = 0; i < currentStrokeNum; i++) {
        if (strokesData[i]) {
          const compIdx = componentGroups.findIndex(group => group.includes(i));
          if (compIdx !== -1) {
            ctx.fillStyle = COMPONENT_COLORS[compIdx % COMPONENT_COLORS.length];
          } else {
            ctx.fillStyle = '#111827';
          }
          ctx.fill(new Path2D(strokesData[i].pathString));
        }
      }
    }
    ctx.restore();

    if (mode === 'practice' && currentStrokeNum < strokesData.length && showHint) {
      const targetMedian = strokesData[currentStrokeNum].median;
      if (targetMedian && targetMedian.length > 0) {
        ctx.beginPath(); ctx.moveTo(targetMedian[0].x, targetMedian[0].y);
        for (let i = 1; i < targetMedian.length; i++) ctx.lineTo(targetMedian[i].x, targetMedian[i].y);
        ctx.strokeStyle = '#fca5a5'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
        ctx.beginPath(); ctx.arc(targetMedian[0].x, targetMedian[0].y, 6, 0, Math.PI * 2); ctx.fillStyle = '#ef4444'; ctx.fill();
      }
    }
    
    if (userPath.length > 0) {
      ctx.beginPath(); ctx.moveTo(userPath[0].x, userPath[0].y);
      for (let i = 1; i < userPath.length; i++) ctx.lineTo(userPath[i].x, userPath[i].y);
      ctx.strokeStyle = feedback === 'error' ? '#ef4444' : '#000000'; ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
    }
  }, [strokesData, currentStrokeNum, showOutline, mode, userPath, feedback, showHint, hiddenStrokes, placedStrokes, placedComps, componentGroups]);

  useEffect(() => {
    let timer;
    if (isPlaying && mode === 'play' && currentStrokeNum < strokesData.length) {
      timer = setTimeout(() => setCurrentStrokeNum(prev => prev + 1), playDelay);
    } else if (isPlaying && currentStrokeNum >= strokesData.length) setIsPlaying(false);
    return () => clearTimeout(timer);
  }, [isPlaying, currentStrokeNum, strokesData.length, mode, playDelay]);

  const getCanvasPoint = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (280 / rect.width), y: (e.clientY - rect.top) * (280 / rect.height) };
  };

  const handlePointerDown = (e) => {
    if (mode !== 'practice' || currentStrokeNum >= strokesData.length) return;
    setFeedback(null);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch(err) {}
    isDrawingRef.current = true;
    pathRef.current = [getCanvasPoint(e)];
    setUserPath([...pathRef.current]);
  };
  const handlePointerMove = (e) => {
    if (!isDrawingRef.current) return;
    pathRef.current.push(getCanvasPoint(e));
    setUserPath([...pathRef.current]);
  };
  const handlePointerUp = (e) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch(err) {}
    evaluateUserStroke(pathRef.current);
  };

  const evaluateUserStroke = (drawnPath) => {
    if (drawnPath.length < 3) { setUserPath([]); return; }
    const targetMedian = strokesData[currentStrokeNum].median;
    if (!targetMedian || targetMedian.length < 2) { successStroke(); return; }

    const distance = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
    const pointToSegmentDistance = (p, v, w) => {
      const l2 = Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2);
      if (l2 === 0) return distance(p, v);
      let t = Math.max(0, Math.min(1, ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2));
      return distance(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) });
    };

    if (distance(drawnPath[0], targetMedian[0]) > 35 || distance(drawnPath[drawnPath.length - 1], targetMedian[targetMedian.length - 1]) > 35) {
      showErrorFeedback(); return;
    }

    const isPathValid = drawnPath.every(userPt => {
      let minDistance = Infinity;
      for (let i = 0; i < targetMedian.length - 1; i++) {
        const dist = pointToSegmentDistance(userPt, targetMedian[i], targetMedian[i + 1]);
        if (dist < minDistance) minDistance = dist;
      }
      return minDistance < 25;
    });

    if (!isPathValid) showErrorFeedback(); else successStroke();
  };

  const successStroke = () => {
    setFeedback('success'); setCurrentStrokeNum(prev => prev + 1);
    setTimeout(() => { setUserPath([]); setFeedback(null); }, 150);
  };

  const showErrorFeedback = () => {
    setFeedback('error');
    setErrorCount(prev => prev + 1);
    setTimeout(() => { setUserPath([]); pathRef.current = []; setFeedback(null); }, 400);
  };

  const handlePlay = () => {
    if (mode === 'practice') handleModeChange('play');
    setCurrentStrokeNum(0); setIsPlaying(true);
  };

  const handleReset = () => {
    setIsPlaying(false); setCurrentStrokeNum(0); setUserPath([]); setFeedback(null); pathRef.current = []; isDrawingRef.current = false; setErrorCount(0);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputChar.trim()[0]) { 
        const newChar = inputChar.trim()[0];
        setChar(newChar); 
        setParentChar(newChar);
        setInputChar(''); 
    }
  };

  const currentStrokesCount = strokesData.length;
  const maxAllowedComps = Math.min(currentStrokesCount, 7); 
  const componentOptions = [];
  if (currentStrokesCount > 0) {
    const startIdx = Math.min(2, currentStrokesCount);
    for (let i = startIdx; i <= maxAllowedComps; i++) {
      componentOptions.push(i);
    }
  }

  const displayNumComps = Math.min(numComps, Math.max(1, currentStrokesCount));

  // 判斷各個模式是否過關
  const isPracticeCompleted = mode === 'practice' && currentStrokeNum === strokesData.length && strokesData.length > 0 && !isLoading;
  const isPuzzleCompleted = mode === 'puzzle' && hiddenStrokes.length > 0 && placedStrokes.length === hiddenStrokes.length && !isLoading;
  const isComponentCompleted = mode === 'component' && componentGroups.length > 0 && placedComps.length === componentGroups.length && !isLoading;
  const isCompleted = isPracticeCompleted || isPuzzleCompleted || isComponentCompleted;

  // --- 新增：用來控制成功動畫顯示 2 秒的狀態與特效 ---
  const [showSuccessGif, setShowSuccessGif] = useState(false);
  
  useEffect(() => {
    if (isCompleted) {
      setShowSuccessGif(true);
      const timer = setTimeout(() => setShowSuccessGif(false), 2000); // 2秒後自動隱藏
      return () => clearTimeout(timer);
    } else {
      setShowSuccessGif(false);
    }
  }, [isCompleted]);
  // ------------------------------------------------

  return (
    <div className="min-h-screen bg-stone-100 p-2 md:p-4 font-sans text-gray-800 flex flex-col items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-stone-200">
        <div className="flex w-full bg-slate-100 border-b border-slate-200 text-sm font-medium">
          <button onClick={() => handleModeChange('play')} className={`flex-1 py-3 flex flex-col items-center justify-center gap-1 transition-colors ${mode === 'play' ? 'bg-white text-slate-800 border-t-2 border-t-blue-500' : 'text-slate-500 hover:text-slate-700'}`}>
            <Video size={18} /> <span className="text-xs">播放展示</span>
          </button>
          <button onClick={() => handleModeChange('practice')} className={`flex-1 py-3 flex flex-col items-center justify-center gap-1 transition-colors ${mode === 'practice' ? 'bg-white text-slate-800 border-t-2 border-t-rose-500' : 'text-slate-500 hover:text-slate-700'}`}>
            <Edit2 size={18} /> <span className="text-xs">仿寫練習</span>
          </button>
          <button onClick={() => handleModeChange('puzzle')} className={`flex-1 py-3 flex flex-col items-center justify-center gap-1 transition-colors ${mode === 'puzzle' ? 'bg-white text-slate-800 border-t-2 border-t-emerald-500' : 'text-slate-500 hover:text-slate-700'}`}>
            <Puzzle size={18} /> <span className="text-xs">筆畫配對</span>
          </button>
          <button onClick={() => handleModeChange('component')} className={`flex-1 py-3 flex flex-col items-center justify-center gap-1 transition-colors ${mode === 'component' ? 'bg-white text-slate-800 border-t-2 border-t-purple-500' : 'text-slate-500 hover:text-slate-700'}`}>
            <Blocks size={18} /> <span className="text-xs">部件拼貼</span>
          </button>
        </div>

        <div className="p-4 md:p-5 flex flex-col items-center">
          <form onSubmit={handleSubmit} className="w-full flex gap-2 mb-4">
            <input type="text" maxLength={1} value={inputChar} onChange={(e) => setInputChar(e.target.value)} placeholder="輸入中文字或注音 (如：王)..." className="flex-1 px-4 py-2 text-lg border-2 border-gray-200 rounded-xl focus:outline-none focus:border-slate-800 transition-colors shadow-sm text-center font-medium"/>
            <button type="submit" className="bg-slate-800 hover:bg-slate-900 text-white px-6 py-2 rounded-xl transition-colors shadow-sm flex items-center justify-center"><Search size={20} /></button>
          </form>

          {error && (
            <div className="mb-4 text-red-600 flex items-center gap-2 bg-red-50 px-4 py-2 rounded-lg w-full">
               <AlertCircle size={18} /> <span className="text-sm font-medium">{error}</span>
            </div>
          )}

          {/* 加入 relative 讓外層區塊成為絕對定位的基準點 */}
          <div className="flex flex-row items-center justify-center gap-3 w-full mb-2 relative">
            
            {/* 新增：錯誤回饋圖示 (改在文字框右邊) */}
            {feedback === 'error' && (
              <div className="absolute right-0 md:-right-2 top-1/2 -translate-y-1/2 z-[60] pointer-events-none">
                <img src="https://raw.githubusercontent.com/aday0123/stroke-order-app/refs/heads/main/wrong.gif" alt="錯誤" className="w-24 h-24 object-contain drop-shadow-xl" />
              </div>
            )}

            {/* 新增：完成回饋圖示 (改在文字框右邊，並改用 showSuccessGif 控制) */}
            {showSuccessGif && (
              <div className="absolute right-0 md:-right-2 top-1/2 -translate-y-1/2 z-[60] pointer-events-none">
                <img src="https://raw.githubusercontent.com/aday0123/stroke-order-app/refs/heads/main/right.gif" alt="完成" className="w-32 h-32 object-contain drop-shadow-xl" />
              </div>
            )}

            <div 
              className={`relative w-[280px] h-[280px] shrink-0 border-4 ${
                  (mode === 'puzzle' && selectedPiece !== null) || (mode === 'component' && selectedComp !== null) 
                    ? 'border-red-400 border-dashed' : 'border-slate-900'
                } bg-white shadow-md flex justify-center items-center overflow-hidden rounded-md transition-colors touch-none`}
              onClick={(e) => {
                if (mode === 'puzzle' && selectedPiece !== null) {
                  const pt = getCanvasPoint(e);
                  const median = strokesData[selectedPiece].median;
                  let tCX = 140, tCY = 140;
                  if (median && median.length > 0) {
                    tCX = median.reduce((sum, p) => sum + p.x, 0) / median.length;
                    tCY = median.reduce((sum, p) => sum + p.y, 0) / median.length;
                  }
                  if (Math.hypot(pt.x - tCX, pt.y - tCY) < 35) {
                    setPlacedStrokes(prev => [...prev, selectedPiece]); setSelectedPiece(null); setDraggingPiece(null);
                  } else {
                    showErrorFeedback();
                  }
                } else if (mode === 'component' && selectedComp !== null) {
                  const pt = getCanvasPoint(e);
                  const center = getComponentCenter(componentGroups[selectedComp]);
                  if (Math.hypot(pt.x - center.x, pt.y - center.y) < 50) {
                    setPlacedComps(prev => [...prev, selectedComp]); setSelectedComp(null); setDraggingComp(null);
                  } else {
                    showErrorFeedback();
                  }
                }
              }}
            >
              <div className="absolute inset-y-0 left-1/3 w-0 border-l border-dashed border-slate-200 pointer-events-none"></div>
              <div className="absolute inset-y-0 left-2/3 w-0 border-l border-dashed border-slate-200 pointer-events-none"></div>
              <div className="absolute inset-x-0 top-1/3 h-0 border-t border-dashed border-slate-200 pointer-events-none"></div>
              <div className="absolute inset-x-0 top-2/3 h-0 border-t border-dashed border-slate-200 pointer-events-none"></div>
              <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-30" viewBox="0 0 280 280">
                <line x1="0" y1="0" x2="280" y2="280" stroke="#94a3b8" strokeDasharray="4" />
                <line x1="280" y1="0" x2="0" y2="280" stroke="#94a3b8" strokeDasharray="4" />
                <line x1="140" y1="0" x2="140" y2="280" stroke="#94a3b8" strokeDasharray="4" />
                <line x1="0" y1="140" x2="280" y2="140" stroke="#94a3b8" strokeDasharray="4" />
              </svg>
              
              {isLoading && (
                 <div className="absolute inset-0 flex items-center justify-center bg-white/90 z-20 text-slate-400 font-medium animate-pulse flex-col">
                   <RefreshCw className="animate-spin mb-2" size={24} />
                   解析中...
                 </div>
              )}

              {/* （原有的遮罩與 GIF 已經被我們移除，直接接續這段提示即可） */}
              {feedback === 'error' && (
                <div className="absolute top-2 right-2 z-30 bg-rose-500 text-white text-xs font-bold px-2 py-1 rounded shadow-md animate-bounce">
                  {mode === 'puzzle' || mode === 'component' ? '位置不對喔！' : '寫錯囉！注意起點'}
                </div>
              )}

              <canvas ref={canvasRef} width={280} height={280} className={`absolute inset-0 z-10 touch-none select-none ${mode === 'practice' ? 'cursor-crosshair' : ''}`} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} />
            </div>

            {mode !== 'puzzle' && (
              <div className="flex flex-col gap-2 relative">
                {isAnalyzingAI && (
                  <div className="absolute -top-6 right-0 whitespace-nowrap text-xs font-bold text-amber-500 flex items-center gap-1 animate-pulse">
                    <Sparkles size={12} /> 結構鑑定中
                  </div>
                )}
                {componentsMap[parentChar] && (() => {
                  const currentAiData = componentsMap[parentChar];
                  const aiParts = currentAiData 
                    ? (Array.isArray(currentAiData) ? currentAiData : currentAiData.components || [])
                    : [];
                  const displayParts = [parentChar, ...aiParts];
                  
                  return displayParts.map((c, idx) => (
                    <button
                      key={idx}
                      onClick={() => setChar(c)}
                      className={`w-10 h-10 text-lg rounded-lg border font-bold transition-colors shadow-sm flex items-center justify-center
                        ${char === c ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-300'}`}
                    >
                      {c}
                    </button>
                  ));
                })()}
              </div>
            )}
          </div>

          <div className="min-h-[3rem] w-full flex justify-center items-center mb-1">
            {mode === 'practice' && currentStrokeNum === strokesData.length && strokesData.length > 0 && !isLoading && (
              <div className="bg-green-600 text-white font-bold px-6 py-2 rounded-full shadow-md flex items-center gap-2 animate-bounce">
                {errorCount === 0 ? '完美挑戰！完全沒錯 🎉' : `挑戰完成！共錯了 ${errorCount} 次`}
              </div>
            )}
            {mode === 'puzzle' && hiddenStrokes.length > 0 && placedStrokes.length === hiddenStrokes.length && !isLoading && (
              <div className="bg-emerald-600 text-white font-bold px-6 py-2 rounded-full shadow-md flex items-center gap-2 animate-bounce">
                {errorCount === 0 ? '完美配對！完全沒錯 🎉' : `配對完成！共錯了 ${errorCount} 次`}
              </div>
            )}
            {mode === 'component' && componentGroups.length > 0 && placedComps.length === componentGroups.length && !isLoading && (
              <div className="bg-purple-600 text-white font-bold px-6 py-2 rounded-full shadow-md flex items-center gap-2 animate-bounce">
                {errorCount === 0 ? '完美拼貼！完全沒錯 🎉' : `拼貼完成！共錯了 ${errorCount} 次`}
              </div>
            )}
          </div>

          {mode === 'practice' && (
            <div className="w-full mb-3 text-center text-sm font-medium text-rose-600 bg-rose-50 py-2 rounded-lg border border-rose-100 flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span> 請從紅色圓點處開始下筆
            </div>
          )}

          {mode === 'puzzle' && (
            <div className="w-full mb-4 flex flex-col items-center gap-3">
              <div className="flex justify-between items-center w-full px-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-700">隱藏數量：</span>
                  <select value={numToHide} onChange={(e) => setNumToHide(Number(e.target.value))} className="border border-slate-300 rounded-md px-2 py-1 text-sm bg-white focus:outline-emerald-500">
                    {[2, 3, 4, 5, 6].map(n => (<option key={n} value={n}>{n} 筆</option>))}
                  </select>
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-1">
                  <MousePointer2 size={14}/> 
                  <select value={requireStrokeOrder ? 'true' : 'false'} onChange={(e) => setRequireStrokeOrder(e.target.value === 'true')} className="border-none bg-transparent text-xs font-medium cursor-pointer focus:outline-none p-0 text-slate-500 hover:text-slate-700">
                    <option value="false">不限順序拖放</option><option value="true">照順序拖放</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 justify-center min-h-[4rem] p-3 bg-slate-50 border border-slate-200 rounded-xl w-full">
                {availablePieces.map(idx => {
                  if (placedStrokes.includes(idx)) return null;
                  const nextExpectedStroke = hiddenStrokes.find(i => !placedStrokes.includes(i));
                  const isExpected = !requireStrokeOrder || idx === nextExpectedStroke;
                  return (
                    <div key={idx}
                      onPointerDown={(e) => {
                        if (!isExpected) { setWrongPiece(idx); setFeedback('error'); setErrorCount(prev => prev + 1); setTimeout(() => { setWrongPiece(null); setFeedback(null); }, 500); return; }
                        try { e.currentTarget.setPointerCapture(e.pointerId); } catch(err) {}
                        setDraggingPiece(idx); setSelectedPiece(idx); setDragPos({ x: e.clientX, y: e.clientY });
                      }}
                      onPointerMove={(e) => { if (draggingPiece === idx) setDragPos({ x: e.clientX, y: e.clientY }); }}
                      onPointerUp={(e) => {
                        if (draggingPiece === idx) {
                          try { e.currentTarget.releasePointerCapture(e.pointerId); } catch(err) {}
                          setDraggingPiece(null);
                          if (canvasRef.current) {
                            const rect = canvasRef.current.getBoundingClientRect();
                            if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
                              const pt = { x: (e.clientX - rect.left) * (280 / rect.width), y: (e.clientY - rect.top) * (280 / rect.height) };
                              const median = strokesData[idx].median;
                              let tCX = 140, tCY = 140;
                              if (median && median.length > 0) {
                                tCX = median.reduce((sum, p) => sum + p.x, 0) / median.length;
                                tCY = median.reduce((sum, p) => sum + p.y, 0) / median.length;
                              }
                              if (Math.hypot(pt.x - tCX, pt.y - tCY) < 35) {
                                setPlacedStrokes(prev => [...prev, idx]); setSelectedPiece(null);
                              } else showErrorFeedback();
                            }
                          }
                        }
                      }}
                      onClick={() => { 
                        if (!isExpected) { setWrongPiece(idx); setFeedback('error'); setErrorCount(prev => prev + 1); setTimeout(() => { setWrongPiece(null); setFeedback(null); }, 500); return; }
                        setSelectedPiece(idx === selectedPiece ? null : idx); 
                      }}
                      className={`relative w-14 h-14 border-2 rounded-xl bg-white shadow-sm flex items-center justify-center p-1 transition-all touch-none
                        ${wrongPiece === idx ? 'border-red-500 bg-red-50' : 'cursor-pointer hover:bg-slate-50 border-slate-300'}
                        ${selectedPiece === idx ? 'scale-110 shadow-md ring-2 ring-red-400 border-red-500' : ''}
                        ${draggingPiece === idx ? 'opacity-0' : ''}
                      `}
                    >
                      {wrongPiece === idx && ( <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-xl z-10"><X size={28} className="text-red-500 drop-shadow-md" strokeWidth={4} /></div> )}
                      <svg viewBox="0 0 2048 2048" className="w-full h-full pointer-events-none">
                        {strokesData[idx] && <path d={strokesData[idx].pathString} fill="#111827" />}
                      </svg>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {mode === 'component' && (
             <div className="w-full mb-4 flex flex-col items-center gap-3">
              <div className="flex justify-between items-center w-full px-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-700">共拆分為</span>
                  <select 
                    value={displayNumComps} 
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setNumComps(val);
                      initComponentPuzzle(val); 
                    }}
                    className="border border-slate-300 rounded-md px-1 py-0.5 text-sm bg-white focus:outline-purple-500 font-bold text-purple-700 cursor-pointer"
                  >
                    {componentOptions.map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                  <span className="text-sm font-bold text-slate-700">個部件</span>
                  <button 
                    onClick={() => {
                        setCustomPatternInput(componentGroups.map(g => g.length).join(' '));
                        setCustomSplitError('');
                        setShowCustomModal(true);
                    }}
                    className="ml-1 text-purple-600 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 p-1 rounded-md transition-colors"
                    title="自訂拆解筆畫"
                  >
                    <Edit2 size={16} />
                  </button>
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-1">
                  <MousePointer2 size={14}/> 
                  <select value={requireOrder ? 'true' : 'false'} onChange={(e) => setRequireOrder(e.target.value === 'true')} className="border-none bg-transparent text-xs font-medium cursor-pointer focus:outline-none p-0 text-slate-500 hover:text-slate-700">
                    <option value="false">不限順序拖放</option><option value="true">照順序拖放</option>
                  </select>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-2 justify-center min-h-[4rem] p-3 bg-slate-50 border border-slate-200 rounded-xl w-full">
                {availableComps.map(compIdx => {
                  if (placedComps.includes(compIdx)) return null;
                  const color = COMPONENT_COLORS[compIdx % COMPONENT_COLORS.length];
                  const isExpected = !requireOrder || compIdx === placedComps.length;
                  return (
                    <div key={compIdx}
                      onPointerDown={(e) => {
                        if (!isExpected) { setWrongComp(compIdx); setFeedback('error'); setErrorCount(prev => prev + 1); setTimeout(() => { setWrongComp(null); setFeedback(null); }, 500); return; }
                        try { e.currentTarget.setPointerCapture(e.pointerId); } catch(err) {}
                        setDraggingComp(compIdx); setSelectedComp(compIdx); setDragPos({ x: e.clientX, y: e.clientY });
                      }}
                      onPointerMove={(e) => { if (draggingComp === compIdx) setDragPos({ x: e.clientX, y: e.clientY }); }}
                      onPointerUp={(e) => {
                        if (draggingComp === compIdx) {
                          try { e.currentTarget.releasePointerCapture(e.pointerId); } catch(err) {}
                          setDraggingComp(null);
                          if (canvasRef.current) {
                            const rect = canvasRef.current.getBoundingClientRect();
                            if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
                              const pt = { x: (e.clientX - rect.left) * (280 / rect.width), y: (e.clientY - rect.top) * (280 / rect.height) };
                              const center = getComponentCenter(componentGroups[compIdx]);
                              if (Math.hypot(pt.x - center.x, pt.y - center.y) < 50) {
                                setPlacedComps(prev => [...prev, compIdx]); setSelectedComp(null);
                              } else showErrorFeedback();
                            }
                          }
                        }
                      }}
                      onClick={() => {
                        if (!isExpected) { setWrongComp(compIdx); setFeedback('error'); setErrorCount(prev => prev + 1); setTimeout(() => { setWrongComp(null); setFeedback(null); }, 500); return; }
                        setSelectedComp(compIdx === selectedComp ? null : compIdx);
                      }}
                      className={`relative w-14 h-14 border-2 rounded-xl bg-white shadow-sm flex items-center justify-center p-1 transition-all touch-none cursor-pointer hover:bg-slate-50
                        ${wrongComp === compIdx ? 'border-red-500 bg-red-50' : (selectedComp === compIdx ? `scale-110 shadow-md ring-2 ring-opacity-50` : 'border-slate-300')}
                        ${draggingComp === compIdx ? 'opacity-0' : ''}
                      `}
                      style={{ borderColor: wrongComp === compIdx ? '#ef4444' : (selectedComp === compIdx ? color : undefined), '--tw-ring-color': color }}
                    >
                      {wrongComp === compIdx && ( <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-xl z-10"><X size={28} className="text-red-500 drop-shadow-md" strokeWidth={4} /></div> )}
                      <svg viewBox="0 0 2048 2048" className="w-full h-full pointer-events-none">
                        {componentGroups[compIdx].map(sIdx => ( strokesData[sIdx] && <path key={sIdx} d={strokesData[sIdx].pathString} fill={color} /> ))}
                      </svg>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {draggingPiece !== null && strokesData[draggingPiece] && (() => {
            const median = strokesData[draggingPiece].median;
            let strokeCx = 140, strokeCy = 140;
            if (median && median.length > 0) {
              strokeCx = median.reduce((sum, p) => sum + p.x, 0) / median.length;
              strokeCy = median.reduce((sum, p) => sum + p.y, 0) / median.length;
            }
            return (
              <div className="fixed pointer-events-none z-[100] w-[280px] h-[280px]" style={{ left: dragPos.x, top: dragPos.y, transform: `translate(-${strokeCx}px, -${strokeCy}px)` }}>
                <svg viewBox="0 0 2048 2048" className="w-full h-full drop-shadow-2xl opacity-80">
                  <path d={strokesData[draggingPiece].pathString} fill="#ef4444" />
                </svg>
              </div>
            );
          })()}

          {draggingComp !== null && componentGroups[draggingComp] && (() => {
            const center = getComponentCenter(componentGroups[draggingComp]);
            const color = COMPONENT_COLORS[draggingComp % COMPONENT_COLORS.length];
            return (
              <div className="fixed pointer-events-none z-[100] w-[280px] h-[280px]" style={{ left: dragPos.x, top: dragPos.y, transform: `translate(-${center.x}px, -${center.y}px)` }}>
                <svg viewBox="0 0 2048 2048" className="w-full h-full drop-shadow-2xl opacity-80">
                  {componentGroups[draggingComp].map(sIdx => ( strokesData[sIdx] && <path key={sIdx} d={strokesData[sIdx].pathString} fill={color} /> ))}
                </svg>
              </div>
            );
          })()}

          <div className="flex flex-wrap items-center justify-center gap-2.5 w-full mt-2">
            <button onClick={() => setShowOutline(!showOutline)} className="group relative flex items-center justify-center w-11 h-11 bg-white text-amber-700 hover:bg-amber-50 border border-amber-200 rounded-xl transition-all shadow-sm">
              {showOutline ? <EyeOff size={20} /> : <Eye size={20} />}
              <span className="absolute bottom-full mb-2 hidden group-hover:block whitespace-nowrap bg-slate-800 text-white text-xs px-2 py-1 rounded shadow-lg pointer-events-none z-50">{showOutline ? '隱藏底字' : '顯示底字'}</span>
            </button>
            <button onClick={handleReset} className="group relative flex items-center justify-center w-11 h-11 bg-white text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-xl transition-all shadow-sm">
              <Eraser size={20} />
              <span className="absolute bottom-full mb-2 hidden group-hover:block whitespace-nowrap bg-slate-800 text-white text-xs px-2 py-1 rounded shadow-lg pointer-events-none z-50">清空重來</span>
            </button>

            {mode === 'play' && (
              <>
                <div className="w-px h-6 bg-slate-200 mx-1"></div>
                <button onClick={() => { setIsPlaying(false); setCurrentStrokeNum(prev => Math.max(0, prev - 1)); }} disabled={currentStrokeNum === 0} className="group relative flex items-center justify-center w-11 h-11 bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 rounded-xl transition-all disabled:opacity-50 shadow-sm">
                  <ChevronLeft size={20} />
                  <span className="absolute bottom-full mb-2 hidden group-hover:block whitespace-nowrap bg-slate-800 text-white text-xs px-2 py-1 rounded shadow-lg pointer-events-none z-50">上一筆</span>
                </button>
                <button onClick={handlePlay} className="group relative flex items-center justify-center w-11 h-11 bg-slate-800 text-white hover:bg-slate-900 rounded-xl transition-all shadow-md active:scale-95">
                  <Play size={20} />
                  <span className="absolute bottom-full mb-2 hidden group-hover:block whitespace-nowrap bg-slate-800 text-white text-xs px-2 py-1 rounded shadow-lg pointer-events-none z-50">播放動畫</span>
                </button>
                <button onClick={() => { setIsPlaying(false); setCurrentStrokeNum(prev => Math.min(strokesData.length, prev + 1)); }} disabled={currentStrokeNum >= strokesData.length} className="group relative flex items-center justify-center w-11 h-11 bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 rounded-xl transition-all disabled:opacity-50 shadow-sm">
                  <ChevronRight size={20} />
                  <span className="absolute bottom-full mb-2 hidden group-hover:block whitespace-nowrap bg-slate-800 text-white text-xs px-2 py-1 rounded shadow-lg pointer-events-none z-50">下一筆</span>
                </button>
                <div className="group relative flex items-center justify-center gap-1.5 px-3 h-11 bg-white text-teal-700 border border-teal-200 rounded-xl transition-all shadow-sm">
                  <Gauge size={18} className="shrink-0" />
                  <input type="range" min="100" max="1500" step="100" value={1600 - playDelay} onChange={(e) => setPlayDelay(1600 - parseInt(e.target.value))} className="w-16 h-1.5 bg-teal-100 rounded-lg appearance-none cursor-pointer accent-teal-600"/>
                  <span className="absolute bottom-full mb-2 hidden group-hover:block whitespace-nowrap bg-slate-800 text-white text-xs px-2 py-1 rounded shadow-lg pointer-events-none z-50">播放速度</span>
                </div>
              </>
            )}
            
            {mode === 'practice' && (
              <>
                <div className="w-px h-6 bg-slate-200 mx-1"></div>
                <button onClick={() => setShowHint(!showHint)} className="group relative flex items-center justify-center w-11 h-11 bg-white text-indigo-700 hover:bg-indigo-50 border border-indigo-200 rounded-xl transition-all shadow-sm">
                  {showHint ? <LightbulbOff size={20} /> : <Lightbulb size={20} />}
                  <span className="absolute bottom-full mb-2 hidden group-hover:block whitespace-nowrap bg-slate-800 text-white text-xs px-2 py-1 rounded shadow-lg pointer-events-none z-50">{showHint ? '隱藏提示' : '顯示提示'}</span>
                </button>
              </>
            )}

            {mode === 'puzzle' && (
              <>
                <div className="w-px h-6 bg-slate-200 mx-1"></div>
                <button onClick={initPuzzle} className="group relative flex items-center justify-center w-11 h-11 bg-white text-emerald-700 hover:bg-emerald-50 border border-emerald-200 rounded-xl transition-all shadow-sm">
                  <RefreshCw size={20} />
                  <span className="absolute bottom-full mb-2 hidden group-hover:block whitespace-nowrap bg-slate-800 text-white text-xs px-2 py-1 rounded shadow-lg pointer-events-none z-50">重新洗牌</span>
                </button>
              </>
            )}

            {mode === 'component' && (
              <>
                <div className="w-px h-6 bg-slate-200 mx-1"></div>
                <button onClick={() => initComponentPuzzle(null)} className="group relative flex items-center justify-center w-11 h-11 bg-white text-purple-700 hover:bg-purple-50 border border-purple-200 rounded-xl transition-all shadow-sm">
                  <RefreshCw size={20} />
                  <span className="absolute bottom-full mb-2 hidden group-hover:block whitespace-nowrap bg-slate-800 text-white text-xs px-2 py-1 rounded shadow-lg pointer-events-none z-50">重新拆解</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {showCustomModal && (
        <div className="fixed inset-0 bg-slate-900/50 z-[200] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 flex flex-col gap-4">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <Edit2 size={20} className="text-purple-600"/> 自訂「{char}」部件拆解
                </h3>
                <p className="text-sm text-slate-600">
                    此字共 <strong>{strokesData.length}</strong> 畫。請輸入各部件包含的筆畫數，可用空白或逗號分隔。
                    <br/><span className="text-xs text-slate-400">範例：7 3 3 2 2</span>
                </p>
                <input
                    type="text"
                    value={customPatternInput}
                    onChange={(e) => {
                        setCustomPatternInput(e.target.value);
                        setCustomSplitError('');
                    }}
                    placeholder={`例如: ${strokesData.length > 5 ? '3 3 ...' : '1 2 ...'}`}
                    className="w-full px-4 py-2 border-2 border-slate-200 rounded-xl focus:border-purple-500 focus:outline-none"
                />
                {customSplitError && (
                    <div className="text-xs text-rose-600 bg-rose-50 p-2 rounded-lg font-medium">
                        {customSplitError}
                    </div>
                )}
                <div className="flex justify-end gap-2 mt-2">
                    <button onClick={() => setShowCustomModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl font-medium transition-colors">
                        取消
                    </button>
                    <button onClick={handleSaveCustomSplit} className="px-4 py-2 text-sm bg-purple-600 text-white hover:bg-purple-700 rounded-xl font-medium transition-colors shadow-sm">
                        儲存並套用
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}