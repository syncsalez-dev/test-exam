import { 
  House, 
  BookOpen, 
  CheckCircle, 
  XCircle, 
  CaretLeft, 
  CaretRight, 
  ArrowsClockwise, 
  ShieldCheck, 
  Info, 
  Warning,
  Eye,
  EyeSlash,
  Plus,
  Trash,
  ChartBar,
  Brain,
  Clock,
  WarningCircle,
  TrendUp,
  Target,
  Lightning,
  Timer,
  ChatCircleDots,
  CircleNotch,
  UploadSimple,
  ArrowLeft,
  GraduationCap,
  MagnifyingGlass,
  X,
  Stack,
  Activity,
  LightningSlash,
  Copy,
  TerminalWindow,
  type IconProps
} from 'phosphor-react';
import type { ComponentType } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type StyledIcon = ComponentType<IconProps & { className?: string }>;

function wrap<T extends ComponentType<any>>(Icon: T): StyledIcon {
  return ({ className, ...props }: any) => (
    <Icon className={cn('h-5 w-5', className)} {...props} />
  );
}

export const HouseIcon = wrap(House);
export const BookOpenIcon = wrap(BookOpen);
export const CheckCircleIcon = wrap(CheckCircle);
export const XCircleIcon = wrap(XCircle);
export const CaretLeftIcon = wrap(CaretLeft);
export const CaretRightIcon = wrap(CaretRight);
export const ArrowsClockwiseIcon = wrap(ArrowsClockwise);
export const ShieldCheckIcon = wrap(ShieldCheck);
export const InfoIcon = wrap(Info);
export const WarningIcon = wrap(Warning);
export const EyeIcon = wrap(Eye);
export const EyeSlashIcon = wrap(EyeSlash);
export const PlusIcon = wrap(Plus);
export const TrashIcon = wrap(Trash);
export const ChartBarIcon = wrap(ChartBar);
export const BrainIcon = wrap(Brain);
export const ClockIcon = wrap(Clock);
export const WarningCircleIcon = wrap(WarningCircle);
export const TrendUpIcon = wrap(TrendUp);
export const TargetIcon = wrap(Target);
export const LightningIcon = wrap(Lightning);
export const TimerIcon = wrap(Timer);
export const ChatCircleDotsIcon = wrap(ChatCircleDots);
export const CircleNotchIcon = wrap(CircleNotch);
export const UploadSimpleIcon = wrap(UploadSimple);
export const ArrowLeftIcon = wrap(ArrowLeft);
export const GraduationCapIcon = wrap(GraduationCap);
export const MagnifyingGlassIcon = wrap(MagnifyingGlass);
export const XIcon = wrap(X);
export const StackIcon = wrap(Stack);
export const ActivityIcon = wrap(Activity);
export const LightningSlashIcon = wrap(LightningSlash);
export const CopyIcon = wrap(Copy);
export const TerminalWindowIcon = wrap(TerminalWindow);
