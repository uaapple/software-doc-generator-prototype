function data = cast_input_for_simulink_ut(data, dtype)
dtype = char(string(dtype));
switch dtype
    case {'single'}
        data = single(data);
    case {'double'}
        data = double(data);
    case {'boolean', 'logical'}
        data = logical(data);
    case {'uint8'}
        data = uint8(data);
    case {'uint16'}
        data = uint16(data);
    case {'uint32'}
        data = uint32(data);
    case {'int8'}
        data = int8(data);
    case {'int16'}
        data = int16(data);
    case {'int32'}
        data = int32(data);
    otherwise
        if startsWith(dtype, 'Enum:')
            data = int32(data);
        else
            data = single(data);
        end
end
end
