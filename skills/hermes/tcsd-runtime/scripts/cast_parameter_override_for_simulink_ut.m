function value = cast_parameter_override_for_simulink_ut(name, value, currentValue, dataType)
% Preserve parameter types, including MAT objects degraded when a custom
% storage-class package is unavailable in a local diagnostic environment.
if nargin < 4
    dataType = '';
end
name = char(string(name));
dataType = lower(strtrim(char(string(dataType))));
if strcmp(dataType, 'boolean') || strcmp(dataType, 'bool')
    value = logical(value);
    return;
end
if ismember(dataType, {'single', 'double', 'int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32', 'int64', 'uint64'})
    value = cast(value, dataType);
    return;
end

% MATLAB loads unavailable custom Parameter objects as uint32 placeholders.
% Use only strong project naming conventions for the two common scalar types;
% otherwise preserve the recovered primitive class.
if ~isobject(currentValue) && ~isempty(regexp(name, '(^|_)b[A-Z]', 'once'))
    value = logical(value);
    fprintf('TCSD_PARAM_TYPE_FALLBACK=%s:boolean\n', name);
elseif ~isobject(currentValue) && ~isempty(regexp(name, '(^|_)ti[A-Z]', 'once'))
    value = single(value);
    fprintf('TCSD_PARAM_TYPE_FALLBACK=%s:single\n', name);
elseif isnumeric(currentValue) || islogical(currentValue)
    value = cast(value, 'like', currentValue);
end
end
