function value = restore_degraded_workspace_value_for_simulink_ut(name, value)
% Recover common scalar types when unavailable custom MAT classes load as
% primitive placeholders. Real Simulink/Cornex objects are never changed.
if isobject(value)
    return;
end
name = char(string(name));
if ~isempty(regexp(name, '(^|_)b[A-Z]', 'once'))
    value = logical(value);
elseif ~isempty(regexp(name, '(^|_)ti[A-Z]', 'once'))
    value = single(value);
end
end
