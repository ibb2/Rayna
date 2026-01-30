import { Moon, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useTheme } from '@/components/theme-provider'
import { useMemo } from 'react'
import { Toolbar } from './ui/Toolbar'
import { Icon } from './ui/Icon'

export function ModeToggle() {
  const { theme, setTheme } = useTheme()

  const lightTheme = useMemo(() => {
    return () => setTheme('light')
  }, [setTheme])

  const darkTheme = useMemo(() => {
    return () => setTheme('dark')
  }, [setTheme])
  return (
    <div className="flex flex-row items-center justify-between">
      <div className="flex flex-row items-center gap-1">
        <div className="flex items-center justify-around gap-1 bg-black/5 dark:bg-white/5 rounded-lg">
          <Toolbar.Button
            onClick={lightTheme}
            active={theme === 'light'}
            activeClassName="bg-black/5 dark:bg-white/5"
            className="m-1 mr-0 h-6"
          >
            <Icon name="Sun" className="size-3" />
          </Toolbar.Button>
          <Toolbar.Button
            onClick={darkTheme}
            active={theme === 'dark'}
            activeClassName="bg-black/5 dark:bg-white/5"
            className="m-1 ml-0 h-6"
          >
            <Icon name="Moon" className="size-3" />
          </Toolbar.Button>
        </div>
        <Toolbar.Button
          onClick={() => setTheme('system')}
          active={theme === 'system'}
          className="hover:bg-black/5 dark:hover:bg-white/5 h-8"
        >
          <Icon name="Monitor" className="size-3" />
        </Toolbar.Button>
      </div>
      {/* <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon">
            <Sun className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
            <Moon className="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
            <span className="sr-only">Toggle theme</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setTheme('light')}>Light</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme('dark')}>Dark</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme('system')}>System</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu> */}
    </div>
  )
}
