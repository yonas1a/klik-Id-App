const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Theme updates
code = code.replace(/bg-slate-100/g, 'bg-white');
code = code.replace(/text-slate-900/g, 'text-gray-900');
code = code.replace(/bg-indigo-600/g, 'bg-red-600');
code = code.replace(/text-indigo-600/g, 'text-red-600');
code = code.replace(/bg-indigo-50/g, 'bg-red-50');
code = code.replace(/text-indigo-700/g, 'text-red-700');
code = code.replace(/border-indigo-100/g, 'border-red-100');
code = code.replace(/hover:bg-indigo-100/g, 'hover:bg-red-100');
code = code.replace(/focus:ring-indigo-500/g, 'focus:ring-red-500');
code = code.replace(/text-slate-800/g, 'text-gray-800');
code = code.replace(/text-slate-500/g, 'text-yellow-800');
code = code.replace(/text-slate-400/g, 'text-yellow-600');
code = code.replace(/bg-slate-50/g, 'bg-yellow-50');
code = code.replace(/border-slate-100/g, 'border-yellow-100');
code = code.replace(/border-slate-200/g, 'border-yellow-200');
code = code.replace(/bg-slate-800/g, 'bg-yellow-100');
code = code.replace(/bg-indigo-700/g, 'bg-red-700');
code = code.replace(/accent-indigo-600/g, 'accent-red-600');
code = code.replace(/shadow-indigo-200/g, 'shadow-red-200');
code = code.replace(/hover:bg-indigo-500/g, 'hover:bg-red-500');
code = code.replace(/text-indigo-100/g, 'text-red-100');
code = code.replace(/from-indigo-500 via-purple-500 to-pink-500/g, 'from-red-500 via-orange-500 to-yellow-500');

// Structure replacements
code = code.replace(
  '<div className="flex flex-col lg:flex-row gap-6 p-6 flex-grow print:hidden overflow-hidden h-[calc(100vh-80px)]">',
  '<div className="flex flex-col lg:flex-row gap-4 p-4 flex-grow print:hidden overflow-hidden h-[calc(100vh-80px)]">'
);

code = code.replace(
  '<section className="w-full lg:w-[35%] bg-white rounded-3xl border border-yellow-200 shadow-sm flex flex-col overflow-hidden print:hidden shrink-0">',
  '<section className="w-full lg:w-[25%] bg-white rounded-3xl border border-yellow-200 shadow-sm flex flex-col overflow-hidden print:hidden shrink-0">'
);

const rightSideStr = `        {/* Right Side: Preview & Export */}
        <div className="w-full lg:w-[65%] flex flex-col gap-6 overflow-hidden h-full">

          {/* ID Card Preview Section */}
          <section className="flex-[3] bg-yellow-100 rounded-3xl shadow-xl p-6 flex flex-col relative overflow-hidden print:hidden min-h-0">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500"></div>
            
            <div className="flex justify-between items-center mb-4 z-10 w-full px-2 shrink-0">
              <h3 className="text-white font-semibold uppercase tracking-widest text-xs opacity-60">Preview: ID Badges</h3>
              <span className="text-white text-xs font-medium opacity-80">{selectedEmps.length} Selected ({pages.length} Pages)</span>
            </div>
            
            <div className="flex-1 w-full overflow-y-auto flex flex-col items-center gap-8 py-4">
              {pages.length > 0 ? pages.map((page, i) => (
                <A4Page key={i} page={page} scale={0.45} pageNum={i + 1} idScale={idScale} photoScale={photoScale} nameTop={nameTop} photoBoxTop={photoBoxTop} photoBoxLeft={photoBoxLeft} photoBoxWidth={photoBoxWidth} photoBoxHeight={photoBoxHeight} gapX={gapX} gapY={gapY} />
              )) : (
                 <div className="text-gray-400 font-medium m-auto">Select employees to create badges</div>
              )}
            </div>
          </section>

          {/* Quick Actions & Settings */}
          <section className="bg-white rounded-3xl border border-yellow-200 p-4 flex flex-col lg:flex-row gap-4 print:hidden shrink-0 max-h-[180px]">`;

const newRightSideStr = `        {/* Center: ID Card Preview Section */}
          <section className="flex-1 bg-yellow-50 rounded-3xl shadow-inner p-2 flex flex-col relative overflow-hidden print:hidden min-h-0 border border-yellow-200">
            <div className="flex justify-between items-center mb-2 z-10 w-full px-4 pt-2 shrink-0">
              <h3 className="text-yellow-800 font-bold uppercase tracking-widest text-xs">Preview Area</h3>
              <span className="text-yellow-800 text-xs font-medium">{selectedEmps.length} Selected ({pages.length} Pages)</span>
            </div>
            
            <div className="flex-1 w-full overflow-hidden flex flex-col items-center relative rounded-2xl bg-white/60">
              {pages.length > 0 ? (
                <TransformWrapper initialScale={1} minScale={0.1} maxScale={4} centerOnInit={true} limitToBounds={false}>
                  <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
                    <div className="flex flex-col items-center gap-10 p-10">
                      {pages.map((page, i) => (
                        <A4Page key={i} page={page} scale={1} pageNum={i + 1} idScale={idScale} photoScale={photoScale} nameTop={nameTop} photoBoxTop={photoBoxTop} photoBoxLeft={photoBoxLeft} photoBoxWidth={photoBoxWidth} photoBoxHeight={photoBoxHeight} gapX={gapX} gapY={gapY} />
                      ))}
                    </div>
                  </TransformComponent>
                </TransformWrapper>
              ) : (
                 <div className="text-yellow-600 font-medium m-auto absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">Select employees to create badges</div>
              )}
            </div>
          </section>

          {/* Right Side: Quick Actions & Settings */}
          <section className="w-full lg:w-[25%] bg-white rounded-3xl border border-yellow-200 p-4 flex flex-col gap-4 print:hidden shrink-0 overflow-y-auto">`;

code = code.replace(rightSideStr, newRightSideStr);

// Split adjustments
code = code.replace(/<\/section>\s*<\/div>\s*<\/div>\s*{\/\* Hidden Print Container \*\/}/, '</section>\n      </div>\n\n      {/* Hidden Print Container */}');

// The layout right side currently has flex-row for lg screens, we need flex-col because it's now a side panel
code = code.replace(
  '<section className="w-full lg:w-[25%] bg-white rounded-3xl border border-yellow-200 p-4 flex flex-col lg:flex-row gap-4 print:hidden shrink-0 overflow-y-auto">',
  '<section className="w-full lg:w-[25%] bg-white rounded-3xl border border-yellow-200 p-5 flex flex-col gap-6 print:hidden shrink-0 overflow-y-auto">'
);

// We need to change the inner sections of the right panel (Export / Layout tweaks)
// Now they are left/right, we want them stacked vertically.
code = code.replace(
  '<div className="w-\\[180px\\] shrink-0 flex flex-col justify-start">',
  '<div className="w-full shrink-0 flex flex-col justify-start">'
);
code = code.replace(
  '<div className="flex-1 border-l border-yellow-100 pl-4 flex flex-col justify-start overflow-y-auto h-full pr-1">',
  '<div className="flex-1 border-t border-yellow-100 pt-4 flex flex-col justify-start pr-1">'
);

// Tweak Settings2 icon header positioning
code = code.replace(
  '<h3 className="text-[10px] font-bold text-yellow-600 uppercase tracking-widest flex items-center gap-1 mb-2 sticky top-0 bg-white z-10 pb-1">',
  '<h3 className="text-[10px] font-bold text-yellow-600 uppercase tracking-widest flex items-center gap-1 mb-3 bg-white z-10">   '
);

// Tweak grid columns for tweaks
code = code.replace(
  '<div className="grid grid-cols-2 lg:grid-cols-3 gap-3 gap-x-6 pb-2">',
  '<div className="grid grid-cols-2 gap-4 pb-2">'
);

fs.writeFileSync('src/App.tsx', code);
console.log('App.tsx updated successfully.');
