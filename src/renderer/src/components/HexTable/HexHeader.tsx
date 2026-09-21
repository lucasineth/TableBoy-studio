interface HexHeaderProps {
  value?: number
  corner?: boolean
}

export function HexHeader({ value, corner = false }: HexHeaderProps): React.JSX.Element {
  return (
    <th className={corner ? 'hex-header hex-header--corner' : 'hex-header'} scope="col">
      {corner ? '' : value?.toString(16).toUpperCase()}
    </th>
  )
}
