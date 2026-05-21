import React, { useState, useEffect } from 'react';
import { fetchDriveImageAsBase64 } from '../lib/googleApi';
import { detectFace } from '../lib/faceDetection';

export interface Employee {
  Name: string;
  Role: string;
  ID?: string;
  id?: string;
  Subcity: string;
  Phone: string;
  Photo: string;
  EntryDate?: string;
  id_printed?: string;
}

export function IdCard({ 
  employee, 
  photoScale = 2.2, 
  nameTop = 61,
  photoBoxTop = 19.5,
  photoBoxLeft = 24.5,
  photoBoxWidth = 51,
  photoBoxHeight = 39
}: { 
  employee: Employee, 
  photoScale?: number, 
  nameTop?: number,
  photoBoxTop?: number,
  photoBoxLeft?: number,
  photoBoxWidth?: number,
  photoBoxHeight?: number
}) {
  const [imageSrc, setImageSrc] = useState<string>('');
  const [croppedSrc, setCroppedSrc] = useState<string | null>(null);

  useEffect(() => {
    setCroppedSrc(null);
    if (!employee.Photo) return;
    let isMounted = true;
    
    if (employee.Photo.startsWith('data:')) {
       setImageSrc(employee.Photo);
    } else {
       fetchDriveImageAsBase64(employee.Photo)
         .then(base64 => { if (isMounted) setImageSrc(base64); })
         .catch((err) => {
            console.error(`Failed to load image for ${employee.Name}:`, err);
            if (isMounted) setImageSrc(`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(employee.Name)}`);
         });
    }

    return () => { isMounted = false; };
  }, [employee.Photo, employee.Name, photoScale]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const img = e.currentTarget;
    if (!imageSrc || imageSrc.includes('api.dicebear.com')) return;

    try {
      const tempImg = new Image();
      tempImg.crossOrigin = "anonymous";
      tempImg.src = imageSrc;
      tempImg.onload = async () => {
        try {
          const predictions = await detectFace(tempImg);
          if (predictions.length > 0) {
            const start = predictions[0].topLeft as [number, number];
            const end = predictions[0].bottomRight as [number, number];
            
            const faceWidth = end[0] - start[0];
            const faceHeight = end[1] - start[1];
            
            const cropWidth = faceWidth * photoScale;
            const cropHeight = cropWidth * (187 / 153);

            const faceCenterX = start[0] + faceWidth / 2;
            const faceCenterY = start[1] + faceHeight / 2;
            
            let cropX = faceCenterX - cropWidth / 2;
            let cropY = faceCenterY - cropHeight * 0.45;

            if (cropX < 0) cropX = 0;
            if (cropY < 0) cropY = 0;
            if (cropX + cropWidth > tempImg.width) cropX = tempImg.width - cropWidth;
            if (cropY + cropHeight > tempImg.height) cropY = tempImg.height - cropHeight;
            
            let drawWidth = cropWidth;
            let drawHeight = cropHeight;
            if (cropX < 0) { drawWidth += cropX; cropX = 0; }
            if (cropY < 0) { drawHeight += cropY; cropY = 0; }
            
            const canvas = document.createElement('canvas');
            canvas.width = drawWidth;
            canvas.height = drawHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
               ctx.drawImage(tempImg, cropX, cropY, drawWidth, drawHeight, 0, 0, drawWidth, drawHeight);
               setCroppedSrc(canvas.toDataURL('image/jpeg', 0.95));
            }
          } else {
             setCroppedSrc(imageSrc);
          }
        } catch (err) {
          console.warn("Face detection failed for", employee.Name, err);
          setCroppedSrc(imageSrc);
        }
      };
    } catch (err) {
      console.warn("Face detection process failed", err);
      setCroppedSrc(imageSrc);
    }
  };

  return (
    <div className="relative w-[300px] h-[480px] bg-yellow-400 overflow-hidden shadow-xl flex flex-col font-sans border border-gray-200" style={{ borderRadius: '0px' }}>
      
      {/* Fallback background if template is missing */}
      <div className="absolute inset-0 z-0 bg-yellow-400">
        <div className="absolute inset-x-0 top-0 h-[160px] bg-[#c81016] [clip-path:polygon(0_0,100%_0,100%_100%,50%_20%,0_100%)]"></div>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-yellow-600/30 text-center px-4 font-bold">
          Please upload<br/>template.png to<br/>public folder
        </div>
      </div>

      {/* Content wrapper */}
      <div className="relative z-10 w-full h-full text-left">
        {/* Photo Box container - Z-10 BEHIND TEMPLATE */}
        <div className="absolute z-10 overflow-hidden" style={{ top: `${photoBoxTop}%`, left: `${photoBoxLeft}%`, width: `${photoBoxWidth}%`, height: `${photoBoxHeight}%` }}>
          {employee.Photo ? (
            <img 
              src={croppedSrc || imageSrc || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(employee.Name)}`} 
              alt={employee.Name} 
              onLoad={handleImageLoad}
              className={`w-full h-full object-cover relative z-10 transition-opacity duration-300 ${!imageSrc ? 'opacity-50' : 'opacity-100'}`} 
              style={{ borderRadius: '0px' }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 font-medium bg-gray-100/80">Photo</div>
          )}
        </div>

        {/* Background Template - Z-20 - IN FRONT OF PHOTO */}
        <img src="/template.png" alt="" className="absolute inset-0 w-full h-full object-cover z-20 pointer-events-none" onError={(e) => { e.currentTarget.style.display = 'none'; }} />

        {/* Name Overlay */}
        <div className="absolute text-center z-30 w-full" style={{ top: `${nameTop}%` }}>
           <h2 className="text-2xl font-bold tracking-tight text-[#c81016] truncate px-4 capitalize">{employee.Name.toLowerCase()}</h2>
        </div>

        {/* Text Details Positioned manually to match the template colons */}
        <div className="absolute z-30 text-lg font-medium text-gray-900 leading-tight truncate" style={{ left: '38%', top: '80.5%', width: '55%' }}>
            {employee.id || employee.ID}
        </div>
        
        <div className="absolute z-30 text-lg font-medium text-gray-900 leading-tight truncate" style={{ left: '38%', top: '85.5%', width: '55%' }}>
            {employee.Subcity}
        </div>
        
        <div className="absolute z-30 text-lg font-medium text-gray-900 leading-tight truncate" style={{ left: '38%', top: '90.5%', width: '55%' }}>
            {employee.Phone}
        </div>
      </div>
    </div>
  );
}
