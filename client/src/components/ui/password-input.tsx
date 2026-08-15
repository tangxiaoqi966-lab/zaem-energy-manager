import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './button';

export interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {}

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, id, placeholder, disabled, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);
    return (
      <div className="relative w-full">
        <input
          ref={ref}
          id={id}
          type={visible ? 'text' : 'password'}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pr-11 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
            className
          )}
          {...props}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => setVisible((v) => !v)}
          className="absolute right-0 top-0 h-10 w-10 rounded-l-none border border-transparent bg-transparent px-2 text-slate-500 hover:bg-transparent hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
          aria-label={visible ? '隐藏密码' : '显示密码'}
          title={visible ? '隐藏密码' : '显示密码'}
        >
          {visible ? (
            <EyeOff className="h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <Eye className="h-4 w-4 shrink-0" aria-hidden />
          )}
        </Button>
      </div>
    );
  }
);
PasswordInput.displayName = 'PasswordInput';

export { PasswordInput };
