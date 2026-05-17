import React, { useState, useRef, useEffect } from 'react';
import Papa from 'papaparse';
import { Search, Link as LinkIcon, Printer, Users, Plus, X, Settings2, Download, Lock } from 'lucide-react';
import { jsPDF } from 'jspdf';
import * as htmlToImage from 'html-to-image';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

import { IdCard, Employee } from './components/IdCard';
import { fetchSheetData, fetchDriveImageAsBase64, appendSheetData } from './lib/googleApi';

function AsyncImage({ src, name }: { src: string, name: string }) {
  const [imageSrc, setImageSrc] = useState('');
  useEffect(() => {
    let isMounted = true;
    if (!src) return;
    if (src.startsWith('data:')) {
      setImageSrc(src);
    } else {
      fetchDriveImageAsBase64(src).then(b => isMounted && setImageSrc(b)).catch(() => isMounted && setImageSrc(`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`));
    }
    return () => { isMounted = false; };
  }, [src, name]);
  return <img src={imageSrc || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`} alt={name} className="w-full h-full object-cover bg-white" />;
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

const A4_WIDTH = 794;
const A4_HEIGHT = 1122;

function A4Page({ 
  page, 
  scale = 1, 
  pageNum, 
  idScale = 0.7, 
  photoScale = 2.2, 
  nameTop = 61, 
  photoBoxTop = 18.5,
  photoBoxLeft = 22.5,
  photoBoxWidth = 55,
  photoBoxHeight = 40,
  gapX = 20, 
  gapY = 20 
}: { 
  page: Employee[], 
  scale?: number, 
  pageNum: number, 
  idScale?: number, 
  photoScale?: number, 
  nameTop?: number, 
  photoBoxTop?: number,
  photoBoxLeft?: number,
  photoBoxWidth?: number,
  photoBoxHeight?: number,
  gapX?: number, 
  gapY?: number, 
  key?: React.Key 
}) {
  return (
    <div 
      className="bg-white relative overflow-hidden flex-shrink-0 print:shadow-none" 
      style={{ 
        width: `${A4_WIDTH * scale}px`, 
        height: `${A4_HEIGHT * scale}px`,
        boxShadow: scale < 1 ? '0 10px 25px -5px rgba(0, 0, 0, 0.3)' : 'none'
      }}
    >
      <div 
        className="w-[794px] h-[1122px] pt-[19px] px-[19px] flex flex-wrap content-start justify-center print:bg-white"
        style={{ transform: `scale(${scale})`, transformOrigin: 'top left', gap: `${gapY}px ${gapX}px` }}
      >
         {page.map((emp, i) => (
           <div key={emp.ID || i} className="overflow-hidden border border-gray-200" style={{ width: `${300 * idScale}px`, height: `${480 * idScale}px`, breakInside: 'avoid', borderRadius: '0px' }}>
             <div style={{ transform: `scale(${idScale})`, transformOrigin: 'top left' }} className="w-[300px] h-[480px]">
               <IdCard 
                 employee={emp} 
                 photoScale={photoScale} 
                 nameTop={nameTop} 
                 photoBoxTop={photoBoxTop}
                 photoBoxLeft={photoBoxLeft}
                 photoBoxWidth={photoBoxWidth}
                 photoBoxHeight={photoBoxHeight}
               />
             </div>
           </div>
         ))}
      </div>
    </div>
  );
}

const DUMMY_CSV = `Name,Role,ID,Subcity,Phone,Photo,Entry Date
Natnael Samuael,Driver,0039,lemi kura,+251938306426,https://api.dicebear.com/7.x/initials/svg?seed=Nat,2023-10-01
Yohannes Getachew,Driver,0040,Kirkos,+251900869129,https://api.dicebear.com/7.x/initials/svg?seed=Yoh,2023-10-02
kalab Brhane,Driver,0041,Kirkos,+251978199779,https://api.dicebear.com/7.x/initials/svg?seed=Kal,2023-10-03`;

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginErrorState, setLoginErrorState] = useState('');

  const [csvUrl, setCsvUrl] = useState('https://docs.google.com/spreadsheets/d/1eL7G7pFotD6_JzH7aawWhzkcvG5to5SVuUAVeca6szk/edit?usp=sharing');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedEmps, setSelectedEmps] = useState<Employee[]>([]);

  const [sheetHeaders, setSheetHeaders] = useState<string[]>([]);

  // Layout settings
  const [idScale, setIdScale] = useState(0.75);
  const [photoScale, setPhotoScale] = useState(2.2);
  const [nameTop, setNameTop] = useState(61);
  const [photoBoxTop, setPhotoBoxTop] = useState(18.5);
  const [photoBoxLeft, setPhotoBoxLeft] = useState(22.5);
  const [photoBoxWidth, setPhotoBoxWidth] = useState(55);
  const [photoBoxHeight, setPhotoBoxHeight] = useState(40);
  const [gapX, setGapX] = useState(0);
  const [gapY, setGapY] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  // Manual Employee Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newEmp, setNewEmp] = useState<Employee>({ Name: '', Role: '', ID: '', Subcity: '', Phone: '', Photo: '' });

  // Initial load with mockup data
  useEffect(() => {
    Papa.parse<Employee>(DUMMY_CSV, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setEmployees(results.data as Employee[]);
        if (results.data.length > 0) setSelectedEmps([results.data[0] as Employee]);
      }
    });
  }, []);

  const handleExportCSV = () => {
    const csvData = Papa.unparse(employees);
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'employees_export.csv';
    link.click();
  };

  const handleExportPDF = async () => {
    if (!pdfContainerRef.current || pages.length === 0) return;
    setIsExporting(true);
    
    try {
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [A4_WIDTH, A4_HEIGHT]
      });

      const pageElements = pdfContainerRef.current.querySelectorAll('.pdf-page');
      
      for (let i = 0; i < pageElements.length; i++) {
        if (i > 0) pdf.addPage();
        
        const dataUrl = await htmlToImage.toJpeg(pageElements[i] as HTMLElement, {
          quality: 0.95,
          backgroundColor: '#ffffff',
          pixelRatio: 2,
          skipFonts: true, // Prevents loading external fonts which frequently trigger {isTrusted: true} event errors due to CORS
          imagePlaceholder: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=' // Transparent fallback for broken images
        });
        
        pdf.addImage(dataUrl, 'JPEG', 0, 0, A4_WIDTH, A4_HEIGHT);
      }
      
      pdf.save('ID_Badges.pdf');
    } catch (err) {
      console.error('Error generating PDF:', err);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const validUser = import.meta.env.VITE_USERNAME || 'klikadmin';
    const validPass = import.meta.env.VITE_PASSWORD || 'klikadmin';
    if (loginUsername === validUser && loginPassword === validPass) {
      setIsAuthenticated(true);
      setLoginErrorState('');
    } else {
      setLoginErrorState('Invalid credentials');
    }
  };

  useEffect(() => {
    if (isAuthenticated && csvUrl) {
      handleFetchData();
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="bg-yellow-50 min-h-screen flex items-center justify-center p-4 font-sans">
        <div className="bg-white rounded-3xl shadow-xl w-full max-w-md p-8 border border-yellow-200">
          <div className="flex flex-col items-center mb-8">
            <div className="bg-red-600 p-3 rounded-full mb-4">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-800 tracking-tight">klik</h1>
            <p className="text-yellow-800 font-medium mt-1">Management System</p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 uppercase tracking-widest mb-1.5">Username</label>
              <input 
                type="text" 
                value={loginUsername}
                onChange={e => setLoginUsername(e.target.value)}
                className="w-full px-4 py-3 bg-yellow-50 border border-yellow-200 rounded-xl focus:ring-2 focus:ring-red-500 text-sm outline-none transition-all"
                placeholder="Enter username"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 uppercase tracking-widest mb-1.5">Password</label>
              <input 
                type="password" 
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                className="w-full px-4 py-3 bg-yellow-50 border border-yellow-200 rounded-xl focus:ring-2 focus:ring-red-500 text-sm outline-none transition-all"
                placeholder="Enter password"
              />
            </div>
            
            {loginErrorState && (
              <p className="text-red-500 text-sm font-medium text-center">{loginErrorState}</p>
            )}
            
            <button 
              type="submit"
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 mt-4 rounded-xl shadow-lg transition-colors"
            >
              Secure Login
            </button>
          </form>
        </div>
      </div>
    );
  }



  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    const entryDate = new Date().toISOString().split('T')[0];
    const empWithId = { ...newEmp, ID: newEmp.ID || String(Date.now()).slice(-4), EntryDate: entryDate };
    
    setEmployees([empWithId, ...employees]);
    setSelectedEmps([...selectedEmps, empWithId]);
    setIsModalOpen(false);
    setNewEmp({ Name: '', Role: '', ID: '', Subcity: '', Phone: '', Photo: '' });

    if (csvUrl && sheetHeaders.length > 0) {
      try {
        const rowValues = sheetHeaders.map(header => {
           const h = header.toLowerCase();
           if (h.includes('name')) return empWithId.Name;
           if (h.includes('role') || h.includes('position')) return empWithId.Role;
           if (h.includes('id')) return empWithId.ID;
           if (h.includes('subcity') || h.includes('city') || h.includes('branch')) return empWithId.Subcity;
           if (h.includes('phone') || h.includes('contact')) return empWithId.Phone;
           if (h.includes('photo') || h.includes('image')) return empWithId.Photo;
           if (h.includes('date')) return empWithId.EntryDate;
           return '';
        });
        await appendSheetData(csvUrl, rowValues);
        console.log("Appended to Google Sheets");
      } catch (err) {
        console.error("Failed to append to sheet:", err);
      }
    }
  };



  const handleFetchData = async () => {
    if (!csvUrl) return;
    setLoading(true);
    setError(null);
    try {
      const rawData = await fetchSheetData(csvUrl);
      console.log("Raw sheet data fetched from client:", rawData);

      if (rawData && rawData.length > 0) {
        const headers = rawData[0].map((h: any) => String(h).trim());
        setSheetHeaders(headers);
        const dataObjects = rawData.slice(1).map((row: any[]) => {
          let obj: Record<string, string> = {};
          let hasData = false;
          headers.forEach((h: string, i: number) => {
            if (h) {
              const val = row[i] ? String(row[i]).trim() : '';
              obj[h] = val;
              if (val) hasData = true;
            }
          });
          return hasData ? obj : null;
        }).filter(Boolean);

        // Map dynamic headers like "Full Name", "Phone number", "ID PHOTO" to our Employee keys
        const mappedData: Employee[] = dataObjects.map((d: any, index: number) => {
           // Case insensitive search for keys
           const findKey = (search: string[]) => {
             const keys = Object.keys(d);
             return keys.find(k => search.some(s => k.toLowerCase().includes(s.toLowerCase()))) || '';
           };

           const photoKey = findKey(['photo', 'picture', 'image']);
           const nameKey = findKey(['name', 'full name']);
           const roleKey = findKey(['position', 'postion', 'role', 'title']);
           const phoneKey = findKey(['phone', 'mobile', 'contact']);
           const subcityKey = findKey(['subcity', 'city', 'location', 'branch']);
           const dateKey = findKey(['date', 'entry']);
           const idPrintedKey = findKey(['id_printed', 'id printed', 'printed']);
           
           const keys = Object.keys(d);
           const idKey = keys.find(k => k.toLowerCase() === 'id' || k.toLowerCase() === 'employee id' || k.toLowerCase() === 'id number') || '';

           return {
             Name: d[nameKey] || 'Unknown',
             Role: d[roleKey] || 'Employee',
             ID: d[idKey] || String(index + 1).padStart(4, '0'),
             Subcity: d[subcityKey] || '',
             Phone: d[phoneKey] || '',
             Photo: d[photoKey] || '',
             EntryDate: d[dateKey] || new Date().toISOString().split('T')[0],
             id_printed: d[idPrintedKey] || ''
           };
        });

        setEmployees(mappedData);
        setSelectedEmps(mappedData.length > 0 ? [mappedData[0]] : []);
        setError(null);
      } else {
        setError("No data found or Invalid Google Sheet.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to load from Google Sheets.");
    } finally {
      setLoading(false);
    }
  };

  const filteredEmployees = employees.filter(e => 
    e.Name?.toLowerCase().includes(search.toLowerCase()) || 
    e.ID?.toLowerCase().includes(search.toLowerCase())
  );

  const cardWidth = 300 * idScale;
  const cardHeight = 480 * idScale;
  const itemsPerRow = Math.max(1, Math.floor((756 + gapX) / (cardWidth + gapX)));
  const rowsPerPage = Math.max(1, Math.floor((1084 + gapY) / (cardHeight + gapY)));
  const itemsPerPage = itemsPerRow * rowsPerPage;

  const pages: Employee[][] = chunkArray(selectedEmps, itemsPerPage);

  return (
    <div className="bg-white text-gray-900 min-h-screen w-full font-sans flex flex-col overflow-hidden print:h-auto print:bg-white print:overflow-visible">
      {/* Header Section */}
      <header className="px-6 py-4 flex justify-between items-center border-b border-yellow-200 bg-white print:hidden shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="bg-red-600 p-2 rounded-lg">
            <Users className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-800">klik <span className="font-normal text-yellow-800">| employee's</span></h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex gap-2 relative">
              <input 
                type="text" 
                placeholder="Paste Google Sheets URL..." 
                className="w-full pl-10 pr-4 py-3 bg-yellow-50 border-none rounded-xl focus:ring-2 focus:ring-red-500 text-sm"
                value={csvUrl}
                onChange={(e) => setCsvUrl(e.target.value)}
              />
              <LinkIcon className="w-5 h-5 text-yellow-600 absolute left-3 top-3" />
            </div>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-medium flex items-start gap-3 mt-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div className="break-all whitespace-pre-wrap">
                  <strong className="block mb-1">Sheet Sync Error</strong>
                  {error}
                </div>
              </div>
            )}
          <button 
            onClick={handleFetchData}
            disabled={loading || !csvUrl}
            className="bg-white border border-yellow-200 hover:bg-yellow-50 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50 transition-colors"
          >
            <LinkIcon className="w-4 h-4" />
            Sync Sheet
          </button>
        </div>
      </header>

      {/* Main Content Grid */}
      <div className="flex flex-col lg:flex-row gap-4 p-2 flex-grow print:hidden overflow-hidden h-[calc(100vh-80px)]">
        
        {/* Search & List Section */}
        <section className="w-full lg:w-[25%] bg-white rounded-3xl border border-yellow-200 shadow-sm flex flex-col overflow-hidden print:hidden shrink-0">
          <div className="p-5 border-b border-yellow-100 space-y-4">
            <div className="flex gap-2 mb-2">
              <button 
                onClick={() => setIsModalOpen(true)}
                className="bg-red-50 text-red-700 px-4 py-2 flex-shrink-0 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-red-100 transition-colors border border-red-100"
              >
                <Plus size={16} /> New Entry
              </button>
            </div>
            
            
            <div className="relative">
              <input 
                type="text" 
                placeholder="Search by name or ID..." 
                className="w-full pl-10 pr-4 py-3 bg-yellow-50 border-none rounded-xl focus:ring-2 focus:ring-red-500 text-sm" 
                value={search} 
                onChange={(e) => setSearch(e.target.value)} 
              />
              <Search className="w-5 h-5 text-yellow-600 absolute left-3 top-3" />
            </div>
          </div>
          
          <div className="flex-grow overflow-y-auto">
            <table className="w-full text-left">
              <thead className="bg-yellow-50 text-yellow-800 text-[11px] uppercase tracking-wider font-bold relative z-10 sticky top-0">
                <tr>
                  <th className="px-6 py-3 w-12">
                     <input 
                       type="checkbox" 
                       className="rounded border-yellow-300 text-red-600 focus:ring-red-500"
                       checked={selectedEmps.length > 0 && selectedEmps.length === filteredEmployees.length}
                       onChange={(e) => {
                         if (e.target.checked) setSelectedEmps(filteredEmployees);
                         else setSelectedEmps([]);
                       }}
                     />
                  </th>
                  <th className="px-6 py-3">Employee</th>
                  <th className="px-6 py-3">Role</th>
                  <th className="px-6 py-3">Phone</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-yellow-100">
                {loading ? (
                   <tr><td colSpan={6} className="p-8 text-center text-yellow-800">Loading data...</td></tr>
                ) : filteredEmployees.map((emp, i) => {
                  const isSelected = selectedEmps.some(e => e.ID === emp.ID);
                  const isPrinted = emp.id_printed?.toLowerCase().trim() === 'done';
                  return (
                  <tr 
                    key={i} 
                    className={`cursor-pointer transition-colors ${isSelected ? 'bg-red-50/50' : isPrinted ? 'bg-green-100 hover:bg-green-200' : 'hover:bg-yellow-50'}`} 
                    onClick={() => {
                       if (isSelected) {
                         setSelectedEmps(selectedEmps.filter(e => e.ID !== emp.ID));
                       } else {
                         setSelectedEmps([...selectedEmps, emp]);
                       }
                    }}
                  >
                    <td className="px-6 py-4">
                       <input 
                         type="checkbox" 
                         checked={isSelected}
                         onChange={() => {}} 
                         className="rounded border-yellow-300 text-red-600 focus:ring-red-500"
                       />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-yellow-200 overflow-hidden shadow-sm flex-shrink-0 flex items-center justify-center">
                           <AsyncImage src={emp.Photo} name={emp.Name} />
                        </div>
                        <div>
                          <div className="text-sm font-semibold">{emp.Name}</div>
                          <div className="text-xs text-yellow-800">ID: {emp.ID}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm">{emp.Role}</td>
                    <td className="px-6 py-4 text-sm text-yellow-800">{emp.Phone}</td>
                    <td className="px-6 py-4 text-sm text-yellow-800 whitespace-nowrap">{emp.EntryDate || 'N/A'}</td>
                    <td className="px-6 py-4">
                      <button className="text-red-600 font-medium text-sm">Select</button>
                    </td>
                  </tr>
                )})}
                {filteredEmployees.length === 0 && !loading && (
                   <tr><td colSpan={6} className="p-8 text-center text-yellow-800">No employees found.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="p-2 bg-yellow-50 border-t border-yellow-100 flex justify-between items-center text-xs text-yellow-800">
            <span>Showing {filteredEmployees.length} of {employees.length} employees</span>
          </div>
        </section>

        {/* Center: ID Card Preview Section */}
          <section className="flex-1 bg-gray-100 rounded-3xl shadow-inner p-2 flex flex-col relative overflow-hidden print:hidden min-h-0 border border-gray-200">
            <div className="flex justify-between items-center mb-2 z-10 w-full px-4 pt-2 shrink-0">
              <h3 className="text-gray-700 font-bold uppercase tracking-widest text-xs">Preview Area</h3>
              <span className="text-gray-700 text-xs font-medium">{selectedEmps.length} Selected ({pages.length} Pages)</span>
            </div>
            
            <div className="flex-1 w-full overflow-hidden flex flex-col items-center relative rounded-2xl bg-gray-300">
              {pages.length > 0 ? (
                <TransformWrapper 
                  initialScale={1} 
                  minScale={0.1} 
                  maxScale={4} 
                  centerOnInit={true} 
                  limitToBounds={false}
                  wheel={{ step: 0.001, smoothStep: 0.005 }}
                  panning={{ velocityMultiplier: 0.7 }}
                >
                  <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
                    <div className="flex flex-col items-center gap-10 p-10">
                      {pages.map((page, i) => (
                        <A4Page key={i} page={page} scale={1} pageNum={i + 1} idScale={idScale} photoScale={photoScale} nameTop={nameTop} photoBoxTop={photoBoxTop} photoBoxLeft={photoBoxLeft} photoBoxWidth={photoBoxWidth} photoBoxHeight={photoBoxHeight} gapX={gapX} gapY={gapY} />
                      ))}
                    </div>
                  </TransformComponent>
                </TransformWrapper>
              ) : (
                 <div className="text-gray-500 font-medium m-auto absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">Select employees to create badges</div>
              )}
            </div>
          </section>

          {/* Right Side: Quick Actions & Settings */}
          <section className="w-full lg:w-[18%] bg-white rounded-3xl border border-yellow-200 p-2 flex flex-col gap-4 print:hidden shrink-0 overflow-y-auto">
          <div className="w-[180px] shrink-0 flex flex-col justify-start">
            <h3 className="text-[10px] font-bold text-yellow-600 uppercase tracking-widest mb-3">Export / Print</h3>
            <button 
              onClick={handleExportPDF} 
              disabled={pages.length === 0 || isExporting}
              className="w-full bg-red-600 text-white py-2 rounded-xl font-bold text-xs shadow-md shadow-red-200 flex items-center justify-center gap-2 hover:bg-red-700 disabled:opacity-50 transition-colors mb-2"
            >
              {isExporting ? (
                <>
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Generating...
                </>
              ) : (
                <>
                  <Download className="w-3 h-3" />
                  Save PDF
                </>
              )}
            </button>
            <button 
              onClick={handleExportCSV} 
              className="w-full bg-emerald-50 text-emerald-700 py-2 rounded-xl font-bold text-xs border border-emerald-200 hover:bg-emerald-100 transition-colors flex items-center justify-center gap-2"
            >
              <Download className="w-3 h-3" /> Save CSV
            </button>
            <div className="mt-2 text-[9px] text-center text-yellow-600 font-medium leading-tight">
              Update Sheet: download & paste to yours.
            </div>
          </div>
          
          <div className="flex-1 border-t border-yellow-100 pt-4 flex flex-col justify-start pr-1">
            <div className="flex items-center justify-between gap-1 mb-3 bg-white z-10">
              <h3 className="text-[10px] font-bold text-yellow-600 uppercase tracking-widest flex items-center gap-1">   
                <Settings2 size={12} /> Layout Tweaks
              </h3>
              <button 
                onClick={() => {
                  setIdScale(0.75);
                  setPhotoScale(2.2);
                  setNameTop(61);
                  setPhotoBoxTop(18.5);
                  setPhotoBoxLeft(22.5);
                  setPhotoBoxWidth(55);
                  setPhotoBoxHeight(40);
                  setGapX(0);
                  setGapY(0);
                }}
                className="text-[9px] uppercase font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2 py-1 rounded"
                title="Reset layout settings"
              >
                Reset
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-4 pb-2">
              <div>
                <label className="text-[9px] uppercase font-bold text-yellow-800 flex justify-between">
                  <span>ID Scale</span> <span className="text-red-600">{Math.round(idScale * 100)}%</span>
                </label>
                <input type="range" min="0.4" max="1.5" step="0.05" value={idScale} onChange={e => setIdScale(parseFloat(e.target.value))} className="w-full accent-red-600" />
              </div>
              <div>
                <label className="text-[9px] uppercase font-bold text-yellow-800 flex justify-between">
                  <span>Name Y-Pos</span> <span className="text-red-600">{nameTop}%</span>
                </label>
                <input type="range" min="40" max="80" step="0.5" value={nameTop} onChange={e => setNameTop(parseFloat(e.target.value))} className="w-full accent-red-600" />
              </div>
              <div>
                <label className="text-[9px] uppercase font-bold text-yellow-800 flex justify-between"><span>Gap X</span> <span className="text-red-600">{gapX}px</span></label>
                <input type="range" min="0" max="100" step="5" value={gapX} onChange={e => setGapX(parseInt(e.target.value))} className="w-full accent-red-600" />
              </div>
              <div>
                <label className="text-[9px] uppercase font-bold text-yellow-800 flex justify-between"><span>Gap Y</span> <span className="text-red-600">{gapY}px</span></label>
                <input type="range" min="0" max="100" step="5" value={gapY} onChange={e => setGapY(parseInt(e.target.value))} className="w-full accent-red-600" />
              </div>
              
              
              <div>
                <label className="text-[9px] uppercase font-bold text-yellow-800 flex justify-between">
                  <span>Photo X</span> <span className="text-red-600">{photoBoxLeft}%</span>
                </label>
                <input type="range" min="0" max="100" step="0.5" value={photoBoxLeft} onChange={e => setPhotoBoxLeft(parseFloat(e.target.value))} className="w-full accent-red-600" />
              </div>
              <div>
                <label className="text-[9px] uppercase font-bold text-yellow-800 flex justify-between">
                  <span>Photo Y</span> <span className="text-red-600">{photoBoxTop}%</span>
                </label>
                <input type="range" min="0" max="100" step="0.5" value={photoBoxTop} onChange={e => setPhotoBoxTop(parseFloat(e.target.value))} className="w-full accent-red-600" />
              </div>
              <div>
                <label className="text-[9px] uppercase font-bold text-yellow-800 flex justify-between">
                  <span>Photo Width</span> <span className="text-red-600">{photoBoxWidth}%</span>
                </label>
                <input type="range" min="10" max="100" step="0.5" value={photoBoxWidth} onChange={e => setPhotoBoxWidth(parseFloat(e.target.value))} className="w-full accent-red-600" />
              </div>
              
              <div>
                <label className="text-[9px] uppercase font-bold text-yellow-800 flex justify-between">
                  <span>Photo Height</span> <span className="text-red-600">{photoBoxHeight}%</span>
                </label>
                <input type="range" min="10" max="100" step="0.5" value={photoBoxHeight} onChange={e => setPhotoBoxHeight(parseFloat(e.target.value))} className="w-full accent-red-600" />
              </div>
              <div>
                <label className="text-[9px] uppercase font-bold text-yellow-800 flex justify-between">
                  <span>Photo Zoom</span> <span className="text-red-600">{photoScale.toFixed(1)}x</span>
                </label>
                <input type="range" min="1.0" max="4.0" step="0.1" value={photoScale} onChange={e => setPhotoScale(parseFloat(e.target.value))} className="w-full accent-red-600" />
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Hidden Print Container */}
      <div style={{ position: 'fixed', top: 0, left: 0, pointerEvents: 'none', zIndex: -1000, opacity: 0 }}>
        <div ref={pdfContainerRef} className="w-[794px] bg-white">
          {pages.map((page, i) => (
            <div key={i} className="pdf-page bg-white relative block" style={{ width: A4_WIDTH, height: A4_HEIGHT }}>
              <A4Page page={page} scale={1} pageNum={i + 1} idScale={idScale} photoScale={photoScale} nameTop={nameTop} photoBoxTop={photoBoxTop} photoBoxLeft={photoBoxLeft} photoBoxWidth={photoBoxWidth} photoBoxHeight={photoBoxHeight} gapX={gapX} gapY={gapY} />
            </div>
          ))}
        </div>
      </div>

      {/* Manual Entry Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-yellow-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-2 print:hidden">
          <form onSubmit={handleAddEmployee} className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all">
            <div className="bg-red-600 p-5 text-white flex justify-between items-center">
              <h2 className="font-bold text-lg">Add Custom Entry</h2>
              <button type="button" onClick={() => setIsModalOpen(false)} className="hover:bg-red-500 p-1 rounded-full text-red-100 transition-colors"><X size={20}/></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-yellow-800 uppercase tracking-wider">Full Name</label>
                  <input required type="text" className="w-full mt-1 px-3 py-2 border border-yellow-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500" value={newEmp.Name} onChange={e => setNewEmp({...newEmp, Name: e.target.value})} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-yellow-800 uppercase tracking-wider">Role / Title</label>
                  <input required type="text" className="w-full mt-1 px-3 py-2 border border-yellow-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500" value={newEmp.Role} onChange={e => setNewEmp({...newEmp, Role: e.target.value})} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-yellow-800 uppercase tracking-wider">Employee ID</label>
                  <input type="text" placeholder="Optional" className="w-full mt-1 px-3 py-2 border border-yellow-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500" value={newEmp.ID} onChange={e => setNewEmp({...newEmp, ID: e.target.value})} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-yellow-800 uppercase tracking-wider">Subcity/Branch</label>
                  <input type="text" className="w-full mt-1 px-3 py-2 border border-yellow-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500" value={newEmp.Subcity} onChange={e => setNewEmp({...newEmp, Subcity: e.target.value})} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-yellow-800 uppercase tracking-wider">Phone</label>
                  <input type="text" className="w-full mt-1 px-3 py-2 border border-yellow-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500" value={newEmp.Phone} onChange={e => setNewEmp({...newEmp, Phone: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-yellow-800 uppercase tracking-wider block mb-1">Passport Photo</label>
                <div className="flex items-center gap-4">
                  {newEmp.Photo ? (
                    <img src={newEmp.Photo} alt="Preview" className="w-16 h-16 rounded-full object-cover border-2 border-yellow-200" />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center border-2 border-dashed border-yellow-300 text-yellow-600">
                      <Users size={20} />
                    </div>
                  )}
                  <input type="file" accept="image/*" className="flex-1 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-red-50 file:text-red-700 hover:file:bg-red-100 cursor-pointer" onChange={e => {
                    if (e.target.files && e.target.files[0]) {
                      setNewEmp({...newEmp, Photo: URL.createObjectURL(e.target.files[0])});
                    }
                  }} />
                </div>
              </div>
            </div>
            <div className="p-2 bg-yellow-50 border-t border-yellow-100 flex justify-end">
              <button type="submit" className="bg-red-600 text-white px-6 py-2.5 rounded-lg font-bold text-sm hover:bg-red-700 shadow-md shadow-red-200 transition-all">Add to Roster</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

