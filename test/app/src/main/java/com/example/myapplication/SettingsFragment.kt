package com.example.myapplication

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import com.example.myapplication.databinding.FragmentSettingsBinding

class SettingsFragment : Fragment() {
    private var _binding: FragmentSettingsBinding? = null
    private val binding get() = _binding!!

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentSettingsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.switchSettingsNotif.setOnCheckedChangeListener { _, isChecked ->
            Toast.makeText(requireContext(), if (isChecked) "알림 켜짐" else "알림 꺼짐", Toast.LENGTH_SHORT).show()
        }
        binding.switchSettingsBio.setOnCheckedChangeListener { _, isChecked ->
            Toast.makeText(requireContext(), if (isChecked) "생체 인증 켜짐" else "생체 인증 꺼짐", Toast.LENGTH_SHORT).show()
        }
        binding.switchSettingsDark.setOnCheckedChangeListener { _, isChecked ->
            Toast.makeText(requireContext(), if (isChecked) "다크 모드 켜짐 (추가 적용 필요)" else "다크 모드 꺼짐", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}


