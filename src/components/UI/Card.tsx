import clsx from 'clsx';
import { FC, MouseEvent, ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  forceRounded?: boolean;
  // eslint-disable-next-line no-unused-vars
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
}

export const Card: FC<CardProps> = ({ children, className = '', forceRounded = false, onClick }) => {
  return (
    <div
      className={clsx(
        forceRounded ? 'rounded-xl' : 'rounded-none sm:rounded-xl',
        'border dark:border-gray-700/80 bg-white dark:bg-gray-900',
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
};

interface CardHeaderProps {
  children: ReactNode;
  className?: string;
}

export const CardHeader: FC<CardHeaderProps> = ({ children, className = '' }) => {
  return <div className={`border-b p-3 ${className}`}>{children}</div>;
};

interface CardBodyProps {
  children?: ReactNode;
  className?: string;
}
export const CardBody: FC<CardBodyProps> = ({ children, className = '' }) => {
  return <div className={`p-5 ${className}`}>{children}</div>;
};
