import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Upload } from 'lucide-react';
import { Landing } from '@/features/dashboard/Landing';
import { NewDocDialog } from '@/features/dashboard/NewDocDialog';

/** The landing page before the scroll story replaced it, kept at /ideas/classic for comparison. */
export function ClassicLanding() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  return (
    <div className="h-full overflow-y-auto bg-bg">
      <Landing
        onNew={() => setOpen(true)}
        uploadActions={[{ key: 'home', label: 'Upload on the home page…', icon: <Upload className="size-4" />, run: () => navigate('/') }]}
      />
      <NewDocDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
